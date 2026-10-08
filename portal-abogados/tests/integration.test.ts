import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createSession } from "../functions/_lib/github-auth";
import { googleRegistration, oauthHash } from "../functions/_lib/google-auth";
import type { D1Database, D1Statement } from "../functions/_lib/user-auth";
import worker from "../src/worker";

// In-memory SQLite models D1 statements and atomic batches. No remote database,
// OAuth provider, real account or credential is used by this suite.
class TestDb implements D1Database {
  native = new DatabaseSync(":memory:");
  constructor() {
    for (const file of readdirSync("migrations").filter((file) => file.endsWith(".sql")).sort()) this.native.exec(readFileSync(`migrations/${file}`, "utf8"));
  }
  prepare(query: string): TestStatement { return new TestStatement(this, query); }
  async batch(statements: D1Statement[]) {
    this.native.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.native.exec("COMMIT"); return results; }
    catch (error) { this.native.exec("ROLLBACK"); throw error; }
  }
}
class TestStatement implements D1Statement {
  values: SQLInputValue[] = [];
  constructor(private db: TestDb, private query: string) {}
  bind(...values: unknown[]) { this.values = values as SQLInputValue[]; return this; }
  async run() { const result = this.db.native.prepare(this.query).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
  async first<T>() { return this.db.native.prepare(this.query).get(...this.values) as T | undefined ?? null; }
  async all<T>() { return { results: this.db.native.prepare(this.query).all(...this.values) as T[] }; }
}
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
