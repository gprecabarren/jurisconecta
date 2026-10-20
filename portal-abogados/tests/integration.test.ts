import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { createSession, randomToken, readSession } from "../functions/_lib/github-auth";
import { adminTokenHash, stageAdminAcceptance, validGitHubLogin, hasVerifiedEmail } from "../functions/_lib/admin-members";
import { googleRegistration, oauthHash } from "../functions/_lib/google-auth";
import worker from "../src/worker";
import { onRequest as protectAdmin } from "../functions/admin/[[path]]";

// In-memory SQLite models D1 statements and atomic batches. No remote database,
// OAuth provider, real account or credential is used by this suite.
function environment() {
  const DB = new TestDb();
  return { DB, USER_AUTH_SECRET: "local-test-user-secret-not-for-production", AUTH_SESSION_SECRET: "local-test-admin-secret-not-for-production", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", ASSETS: { fetch: async () => new Response("test asset") } } as unknown as Parameters<typeof worker.fetch>[1];
}
function request(path: string, method = "GET", body?: unknown, cookie = "", origin = "https://jurisconecta.cl") {
  return new Request(`https://jurisconecta.cl${path}`, { method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function adminCookie(env: ReturnType<typeof environment>) { return `juris_admin=${await createSession("gprecabarren", env, request("/admin"))}`; }
const article = { title: "Guía editorial de prueba para Chile", excerpt: "Texto original para verificar validaciones y persistencia del editor de noticias.", content_html: `<p>${"Contenido de prueba suficientemente extenso. ".repeat(6)}</p>`, status: "draft" };

test("news API enforces auth, CSRF, validation, versioning and atomic audit", async () => {
  const env = environment(), cookie = await adminCookie(env);
  assert.equal((await worker.fetch(request("/api/admin/news"), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/admin/news", "POST", article, cookie, "https://evil.example"), env)).status, 403);
  assert.equal((await worker.fetch(request("/api/admin/news", "POST", { title: "x" }, cookie), env)).status, 400);
  const created = await worker.fetch(request("/api/admin/news", "POST", { ...article, content_html: article.content_html + '<script>alert(1)</script>' }, cookie), env);
  assert.equal(created.status, 200);
  const saved = await created.json() as { id: string; version: number };
  const post = await env.DB.prepare("SELECT content_html FROM news_posts WHERE id = ?").bind(saved.id).first<{ content_html: string }>();
  assert.equal(post?.content_html.includes("script"), false);
  assert.equal((await worker.fetch(request("/api/admin/news", "POST", article, cookie), env)).status, 409);
  assert.equal((await worker.fetch(request("/api/admin/news", "PUT", { ...article, ...saved }, cookie), env)).status, 200);
  assert.equal((await worker.fetch(request("/api/admin/news", "PUT", { ...article, ...saved }, cookie), env)).status, 409);
  const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE target_id = ?").bind(saved.id).first<{ n: number }>();
  assert.equal(audit?.n, 2);
});

test("Google staging requires terms, ignores privilege escalation and consumes once", async () => {
  for (const role of ["person", "lawyer"] as const) {
    const env = environment(), token = `test-registration-${role}`, cookie = `juris_google_registration=${token}`;
    await env.DB.prepare("INSERT INTO google_registrations (token_hash, subject, email, full_name, role, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(await oauthHash(token), `sub-${role}`, `${role}@example.test`, "Cuenta de prueba", role, Date.now() + 60_000).run();
    assert.equal((await googleRegistration(request("/api/auth/google/registration", "POST", { fullName: "Cuenta de prueba", acceptTerms: false }, cookie), env)).status, 400);
    const response = await worker.fetch(request("/api/auth/google/registration", "POST", { fullName: "Cuenta de prueba", acceptTerms: true, region: "Región Metropolitana", role: "admin" }, cookie), env);
    assert.equal(response.status, 200);
    const user = await env.DB.prepare("SELECT id, role, status, password_hash, auth_provider, terms_accepted_at FROM users WHERE email = ?").bind(`${role}@example.test`).first<{ id: string; role: string; status: string; password_hash: string | null; auth_provider: string; terms_accepted_at: string }>();
    assert.equal(user?.role, role); assert.equal(user?.status, role === "lawyer" ? "pending" : "active"); assert.equal(user?.password_hash, null); assert.equal(user?.auth_provider, "google"); assert.ok(user?.terms_accepted_at);
    if (role === "lawyer") assert.equal((await env.DB.prepare("SELECT application_status FROM lawyer_profiles WHERE user_id = ?").bind(user!.id).first<{ application_status: string }>())?.application_status, "draft");
    assert.match(response.headers.get("Set-Cookie") || "", /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await googleRegistration(request("/api/auth/google/registration", "POST", { fullName: "Cuenta de prueba", acceptTerms: true }, cookie), env)).status, 401);
  }
});

test("expired Google staging and invalid callback never create accounts", async () => {
  const env = environment(), token = "expired";
  await env.DB.prepare("INSERT INTO google_registrations (token_hash, subject, email, full_name, role, expires_at) VALUES (?, 'expired-sub', 'expired@example.test', 'Prueba expirada', 'person', ?)").bind(await oauthHash(token), Date.now() - 1).run();
  assert.equal((await worker.fetch(request("/api/auth/google/registration", "POST", { fullName: "Prueba", acceptTerms: true }, `juris_google_registration=${token}`), env)).status, 401);
  const callback = await worker.fetch(request("/auth/google/callback?state=wrong&code=invalid"), env);
  assert.equal(callback.status, 303); assert.match(callback.headers.get("Location") || "", /google_error=state/);
});

test("media uploads require admin, actual image bytes and an audit", async () => {
  const env = environment(), cookie = await adminCookie(env), path = "/api/admin/news/media";
  const data = "data:image/png;base64," + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString("base64");
  assert.equal((await worker.fetch(request(path, "POST", { data, alt: "Prueba" }), env)).status, 401);
  assert.equal((await worker.fetch(request(path, "POST", { data: "data:image/png;base64,PHNjcmlwdD4=", alt: "Prueba" }, cookie), env)).status, 400);
  assert.equal((await worker.fetch(request(path, "POST", { data, alt: "" }, cookie), env)).status, 400);
  assert.equal((await worker.fetch(request(path, "POST", { data, alt: "Prueba" }, cookie), env)).status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'news.media.upload'").first<{ n: number }>())?.n, 1);
});

test("maintenance blocks public routes but preserves admin authorization", async () => {
  const env = environment(); await env.DB.prepare("UPDATE site_settings SET maintenance_enabled = 1 WHERE id = 1").run();
  assert.equal((await worker.fetch(request("/api/auth/providers"), env)).status, 503);
  assert.equal((await worker.fetch(request("/noticias/"), env)).status, 503);
  assert.equal((await worker.fetch(request("/api/admin/news"), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/health"), env)).status, 200);
});

test("GitHub invitation verifies ID + email, requires acceptance, and revokes every admin route", async (t) => {
  const env = environment(), owner = await adminCookie(env);
  env.GITHUB_CLIENT_SECRET = "test-github-secret-not-for-production";
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/login/oauth/access_token")) return Response.json({ access_token: "test-provider-token" });
    if (url.includes("/user/emails")) return Response.json([{ email: "admin@example.test", verified: true }]);
    return Response.json({ id: 42, login: "invited-admin", type: "User" });
  });
  const path = "/api/admin/administrators", publicPath = "/api/invitaciones-admin";
  assert.equal((await worker.fetch(request(path), env)).status, 401);
  assert.equal((await worker.fetch(request(path, "POST", { githubLogin: "invited-admin", email: "admin@example.test", confirmAccess: true }, owner, "https://evil.example"), env)).status, 403);
  assert.equal((await worker.fetch(request(path, "POST", { githubLogin: "bad--login", email: "bad", confirmAccess: true }, owner), env)).status, 400);
  const response = await worker.fetch(request(path, "POST", { githubLogin: "invited-admin", email: "admin@example.test", confirmAccess: true }, owner), env);
  assert.equal(response.status, 200);
  const created = await response.json() as { invitationUrl: string };
  const token = new URL(created.invitationUrl).hash.slice(1);
  assert.equal(token.length, 43);
  const stored = await env.DB.prepare("SELECT token_hash FROM admin_invitations").first<{ token_hash: string }>();
  assert.notEqual(stored?.token_hash, token);
  const listing = JSON.stringify(await (await worker.fetch(request(path, "GET", undefined, owner), env)).json());
  assert.equal(listing.includes(token), false); assert.equal(listing.includes("token_hash"), false);
  assert.equal((await worker.fetch(request(publicPath, "POST", { action: "accept", confirmAccess: true }), env)).status, 401);
  const start = await worker.fetch(request(publicPath, "POST", { action: "start", token }), env);
  assert.equal(start.status, 200);
  const authorization = new URL((await start.json() as { authorizationUrl: string }).authorizationUrl);
  assert.equal(authorization.searchParams.get("scope"), "read:user user:email");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const oauthCookie = `juris_oauth_state=${authorization.searchParams.get("state")}`;
  const callbackPath = `/auth/github/callback?state=${authorization.searchParams.get("state")}&code=test`;
  const callback = await worker.fetch(request(callbackPath, "GET", undefined, oauthCookie), env);
  assert.equal(callback.status, 303); assert.equal(callback.headers.get("Location"), "/invitacion-admin/");
  const proofToken = /juris_admin_accept=([^;]+)/.exec(callback.headers.get("Set-Cookie") || "")?.[1];
  assert.ok(proofToken); const proofCookie = `juris_admin_accept=${proofToken}`;
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM github_administrators").first<{ n: number }>())?.n, 1);
  assert.equal((await worker.fetch(request(callbackPath, "GET", undefined, oauthCookie), env)).status, 400);
  assert.equal((await worker.fetch(request(publicPath, "POST", { action: "accept", confirmAccess: false }, proofCookie), env)).status, 400);
  const accepted = await worker.fetch(request(publicPath, "POST", { action: "accept", confirmAccess: true, role: "owner" }, proofCookie), env);
  assert.equal(accepted.status, 200);
  const sessionToken = /juris_admin=([^;]+)/.exec(accepted.headers.get("Set-Cookie") || "")?.[1];
  assert.ok(sessionToken); const newCookie = `juris_admin=${sessionToken}`;
  assert.equal((await readSession(request("/admin", "GET", undefined, newCookie), env))?.role, "admin");
  assert.equal((await worker.fetch(request(publicPath, "POST", { action: "accept", confirmAccess: true }, proofCookie), env)).status, 410);
  for (const route of ["profiles", "content", "settings", "news", "users", "sessions", "me"]) assert.equal((await worker.fetch(request(`/api/admin/${route}`, "GET", undefined, newCookie), env)).status, 200, route);
  assert.equal((await worker.fetch(request(path, "POST", { githubLogin: "another-admin", email: "x@example.test", confirmAccess: true }, newCookie), env)).status, 403);
  assert.equal((await worker.fetch(request(path, "PATCH", { action: "revoke_admin", githubId: 58262409 }, owner), env)).status, 403);
  assert.equal((await worker.fetch(request(path, "PATCH", { action: "revoke_admin", githubId: 42 }, owner), env)).status, 200);
  for (const route of ["profiles", "content", "settings", "news", "users", "sessions", "me", "administrators", "audit", "tickets", "cases", "applications", "recovery"]) assert.equal((await worker.fetch(request(`/api/admin/${route}`, "GET", undefined, newCookie), env)).status, 401, route);
  assert.equal((await worker.fetch(request("/admin/", "GET", undefined, newCookie), env)).status, 302);
  const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action IN ('admin_invitation.create','admin_invitation.accept','admin_access.revoke')").first<{ n: number }>();
  assert.equal(audit?.n, 3);
});

test("GitHub proofs reject wrong identity/email, expiry, revoked invitations and unauthenticated logout", async () => {
  const env = environment(), id = crypto.randomUUID(), token = randomToken();
  const invitation = { id, github_id: 43, github_login: "second-admin", email: "second@example.test", invited_by: "gprecabarren", expires_at: Date.now() + 60_000 };
  await env.DB.prepare("INSERT INTO admin_invitations (id, token_hash, github_id, github_login, email, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, await adminTokenHash(token), 43, invitation.github_login, invitation.email, invitation.invited_by, invitation.expires_at).run();
  assert.equal(await stageAdminAcceptance(env, invitation, { id: 44, login: "second-admin", type: "User" }, [{ email: invitation.email, verified: true }]), null);
  assert.equal(await stageAdminAcceptance(env, invitation, { id: 43, login: "second-admin", type: "User" }, [{ email: invitation.email, verified: false }]), null);
  assert.equal(await stageAdminAcceptance(env, invitation, { id: 43, login: "second-admin", type: "User" }, [{ email: "wrong@example.test", verified: true }]), null);
  const proof = await stageAdminAcceptance(env, invitation, { id: 43, login: "renamed-admin", type: "User" }, [{ email: invitation.email, verified: true }]);
  assert.ok(proof);
  const cookie = `juris_admin_accept=${proof}`;
  await env.DB.prepare("UPDATE admin_acceptance_proofs SET expires_at = ?").bind(Date.now() - 1).run();
  assert.equal((await worker.fetch(request("/api/invitaciones-admin", "POST", { action: "accept", confirmAccess: true }, cookie), env)).status, 410);
  await env.DB.prepare("UPDATE admin_acceptance_proofs SET expires_at = ?").bind(Date.now() + 60_000).run();
  const owner = await adminCookie(env);
  assert.equal((await worker.fetch(request("/api/admin/administrators", "PATCH", { action: "revoke_invitation", id }, owner), env)).status, 200);
  assert.equal((await worker.fetch(request("/api/invitaciones-admin", "POST", { action: "accept", confirmAccess: true }, cookie), env)).status, 410);
  assert.equal((await worker.fetch(request("/api/admin/me", "DELETE"), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/admin/me", "DELETE", undefined, owner), env)).status, 200);
  assert.equal(await readSession(request("/admin", "GET", undefined, owner), env), null);
  assert.equal(validGitHubLogin("valid-user"), true); assert.equal(validGitHubLogin("invalid--user"), false);
  assert.equal(hasVerifiedEmail([{ email: "USER@example.test", verified: true }], "user@example.test"), true);
});

test("legacy owner cookies retain access only while registry and session remain active", async () => {
  const env = environment();
  const sessionId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO admin_sessions (id, github_login, github_id, device, location) VALUES (?, 'gprecabarren', 58262409, 'Test browser', 'Test location')").bind(sessionId).run();
  const payload = Buffer.from(JSON.stringify({ login: "gprecabarren", sessionId, expiresAt: Date.now() + 60_000 })).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AUTH_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))).toString("base64url");
  const cookie = `juris_admin=${payload}.${signature}`;
  assert.equal((await readSession(request("/admin/", "GET", undefined, cookie), env))?.role, "owner");
  // Binding/fetch responses may have immutable headers. Clone before adding privacy headers.
  const protectedAsset = await protectAdmin({ request: request("/admin/", "GET", undefined, cookie), env, next: async () => Response.redirect("https://jurisconecta.cl/admin/", 308) });
  assert.equal(protectedAsset.headers.get("Cache-Control"), "no-store");
  assert.equal(protectedAsset.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  await env.DB.prepare("UPDATE github_administrators SET github_login = 'renamed-owner' WHERE github_id = 58262409").run();
  assert.equal((await readSession(request("/admin/", "GET", undefined, cookie), env))?.login, "renamed-owner");
  await env.DB.prepare("UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sessionId).run();
  assert.equal(await readSession(request("/admin/", "GET", undefined, cookie), env), null);
  assert.equal(await readSession(request("/admin/", "GET", undefined, `juris_admin=${payload}.forged`), env), null);
});
