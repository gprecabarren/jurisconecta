import { authSettings, cookie, cookieValue, clearCookie, createSession, randomToken, readSession, type AuthEnv } from "./github-auth";
import { adminAuditStatement } from "./admin-audit";
import { readJsonBody } from "./http";

type Invitation = { id: string; github_id: number; github_login: string; email: string; invited_by: string; expires_at: number };
type Proof = { token_hash: string; invitation_id: string; github_id: number; github_login: string; email: string; expires_at: number };
export type GitHubProfile = { id: number; login: string; type: "User" };
export const validGitHubLogin = (value: string) => /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value);
export const validAdminEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function githubProfile(value: unknown): GitHubProfile | null {
  if (!value || typeof value !== "object" || !("id" in value) || !("login" in value) || !("type" in value)) return null;
  return typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0 && typeof value.login === "string" && validGitHubLogin(value.login) && value.type === "User" ? { id: value.id, login: value.login, type: "User" } : null;
}
export function hasVerifiedEmail(value: unknown, email: string) {
  return Array.isArray(value) && value.some((row: unknown) => row && typeof row === "object" && "email" in row && typeof row.email === "string" && "verified" in row && row.verified === true && row.email.toLowerCase() === email.toLowerCase());
}
export async function adminTokenHash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export async function githubJson(path: string, accessToken?: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "JurisConecta-Admin", "X-GitHub-Api-Version": "2026-03-10", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("No pudimos verificar los datos con GitHub. Intenta nuevamente.");
  return response.json();
}
async function limited(request: Request, env: AuthEnv, bucket: string, max = 20) {
  if (!env.DB) return false;
  const key = `github:${bucket}:${await adminTokenHash(`${authSettings(env).sessionSecret}:${request.headers.get("CF-Connecting-IP") || "local"}`)}`;
  const now = Date.now();
  const row = await env.DB.prepare("INSERT INTO auth_rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING count").bind(key, now, now - 3600_000, now - 3600_000).first<{ count: number }>();
  return Boolean(row && row.count <= max);
}
export async function startGitHub(request: Request, env: AuthEnv, invitation?: Invitation) {
  const settings = authSettings(env);
  if (!env.DB || !settings.clientSecret || !settings.sessionSecret) return new Response("Autenticación no disponible.", { status: 503 });
  if (!await limited(request, env, "oauth")) return new Response("Demasiados intentos. Vuelve a probar en una hora.", { status: 429 });
  const state = randomToken(), verifier = randomToken(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM github_oauth_flows WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM admin_acceptance_proofs WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM auth_rate_limits WHERE window_start < ?").bind(now - 86400_000),
    env.DB.prepare("INSERT INTO github_oauth_flows (state_hash, verifier, invitation_id, expires_at) VALUES (?, ?, ?, ?)").bind(await adminTokenHash(state), verifier, invitation?.id ?? null, now + 600_000),
  ]);
  const authorization = new URL("https://github.com/login/oauth/authorize");
  authorization.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: `${new URL(request.url).origin}/auth/github/callback`, scope: invitation ? "read:user user:email" : "read:user", state, code_challenge: await adminTokenHash(verifier), code_challenge_method: "S256", allow_signup: "false", ...(invitation ? { login: invitation.github_login } : {}) }).toString();
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", cookie("juris_oauth_state", state, 600));
  headers.append("Set-Cookie", clearCookie("juris_admin_accept"));
  if (invitation) { headers.set("Content-Type", "application/json"); return new Response(JSON.stringify({ authorizationUrl: authorization.toString() }), { headers }); }
  headers.set("Location", authorization.toString());
  return new Response(null, { status: 302, headers });
}
export async function handleAdminMe(request: Request, env: AuthEnv) {
  const member = await readSession(request, env);
  if (!member || !env.DB) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (request.method === "GET") return Response.json({ login: member.login, githubId: member.githubId, role: member.role });
  if (request.method !== "DELETE") return new Response(null, { status: 405, headers: { Allow: "GET, DELETE" } });
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(member.sessionId),
    await adminAuditStatement(request, env, env.DB, "admin.logout", "admin_session", member.sessionId),
  ]);
  return Response.json({ loggedOut: true }, { headers: { "Set-Cookie": clearCookie("juris_admin") } });
}
export async function handleAdminMembers(request: Request, env: AuthEnv) {
  const member = await readSession(request, env);
  if (!member || !env.DB) return Response.json({ error: "No autorizado." }, { status: 401 });
  const db = env.DB;
  if (request.method === "GET") {
    const [administrators, invitations] = await Promise.all([
      db.prepare("SELECT github_id, github_login, email, role, status, invited_by, created_at, accepted_at, revoked_at FROM github_administrators ORDER BY role DESC, created_at").all(),
      db.prepare("SELECT id, github_login, email, invited_by, status, expires_at, created_at FROM admin_invitations ORDER BY created_at DESC LIMIT 100").all(),
    ]);
    return Response.json({ administrators: administrators.results, invitations: invitations.results, canManage: member.role === "owner", now: Date.now() });
  }
  if (!["POST", "PATCH"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, POST, PATCH" } });
  if (member.role !== "owner") return Response.json({ error: "Solo el propietario puede gestionar estos accesos." }, { status: 403 });
  const body = await readJsonBody(request, 4096);
  if (!body) return Response.json({ error: "Datos inválidos." }, { status: 400 });
  if (request.method === "PATCH") {
    if (body.action === "revoke_invitation" && typeof body.id === "string") {
      const existing = await db.prepare("SELECT id FROM admin_invitations WHERE id = ? AND status = 'pending'").bind(body.id).first();
      if (!existing) return Response.json({ error: "Invitación no disponible." }, { status: 404 });
      await db.batch([
        db.prepare("UPDATE admin_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'").bind(body.id),
        db.prepare("DELETE FROM admin_acceptance_proofs WHERE invitation_id = ?").bind(body.id),
        await adminAuditStatement(request, env, db, "admin_invitation.revoke", "admin_invitation", body.id),
      ]);
      return Response.json({ revoked: true });
    }
    if (body.action !== "revoke_admin" || typeof body.githubId !== "number") return Response.json({ error: "Acción inválida." }, { status: 400 });
    const target = await db.prepare("SELECT role, github_login, status FROM github_administrators WHERE github_id = ?").bind(body.githubId).first<{ role: string; github_login: string; status: string }>();
    if (!target || target.status !== "active") return Response.json({ error: "Administrador no disponible." }, { status: 404 });
    if (target.role === "owner" || body.githubId === member.githubId) return Response.json({ error: "El propietario y tu propia cuenta están protegidos." }, { status: 403 });
    await db.batch([
      db.prepare("UPDATE github_administrators SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE github_id = ? AND role = 'admin'").bind(body.githubId),
      db.prepare("UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE github_id = ? AND revoked_at IS NULL").bind(body.githubId),
      await adminAuditStatement(request, env, db, "admin_access.revoke", "github_administrator", String(body.githubId), { login: target.github_login }),
    ]);
    return Response.json({ revoked: true });
  }
  const login = typeof body.githubLogin === "string" ? body.githubLogin.trim().replace(/^@/, "") : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validGitHubLogin(login) || !validAdminEmail(email) || body.confirmAccess !== true) return Response.json({ error: "Indica un usuario GitHub válido, su correo verificado y confirma el acceso administrativo." }, { status: 400 });
  if (!await limited(request, env, "invitation", 6)) return Response.json({ error: "Límite de 6 invitaciones por hora alcanzado." }, { status: 429 });
  const count = await db.prepare("SELECT COUNT(*) AS n FROM github_administrators WHERE status = 'active'").first<{ n: number }>();
  if ((count?.n ?? 0) >= 20) return Response.json({ error: "Límite de seguridad de 20 administradores alcanzado." }, { status: 409 });
  let profile: GitHubProfile | null;
  try { profile = githubProfile(await githubJson(`/users/${encodeURIComponent(login)}`)); }
  catch { return Response.json({ error: "No pudimos consultar ese usuario en GitHub. Revisa el nombre o prueba más tarde." }, { status: 422 }); }
  if (!profile) return Response.json({ error: "Solo se pueden invitar cuentas personales de GitHub." }, { status: 400 });
  const active = await db.prepare("SELECT github_id FROM github_administrators WHERE (github_id = ? OR github_login = ?) AND status = 'active'").bind(profile.id, profile.login).first();
  if (active) return Response.json({ error: "Esta cuenta ya tiene acceso." }, { status: 409 });
  const id = crypto.randomUUID(), token = randomToken(), expiresAt = Date.now() + 72 * 3600_000;
  try {
    await db.batch([
      db.prepare("UPDATE admin_invitations SET status = 'revoked' WHERE expires_at <= ? AND status = 'pending'").bind(Date.now()),
      db.prepare("INSERT INTO admin_invitations (id, token_hash, github_id, github_login, email, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, await adminTokenHash(token), profile.id, profile.login, email, member.login, expiresAt),
      await adminAuditStatement(request, env, db, "admin_invitation.create", "admin_invitation", id, { githubId: profile.id, login: profile.login, expiresAt }),
    ]);
  } catch { return Response.json({ error: "Ya existe una invitación pendiente para esta cuenta. Revócala antes de crear otra." }, { status: 409 }); }
  // Fragment is not sent in HTTP URLs or referrer headers. Plain token returned once.
  return Response.json({ invitationUrl: `${new URL(request.url).origin}/invitacion-admin/#${token}`, expiresAt, email, login: profile.login });
}
export async function pendingInvitation(env: AuthEnv, id: string) {
  return env.DB?.prepare("SELECT id, github_id, github_login, email, invited_by, expires_at FROM admin_invitations WHERE id = ? AND status = 'pending' AND expires_at > ?").bind(id, Date.now()).first<Invitation>() ?? null;
}
export async function stageAdminAcceptance(env: AuthEnv, invitation: Invitation, profile: GitHubProfile, emails: unknown) {
  if (!env.DB || profile.id !== invitation.github_id || !hasVerifiedEmail(emails, invitation.email)) return null;
  const proof = randomToken();
  await env.DB.prepare("INSERT INTO admin_acceptance_proofs (token_hash, invitation_id, github_id, github_login, email, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(await adminTokenHash(proof), invitation.id, profile.id, profile.login, invitation.email, Date.now() + 600_000).run();
  return proof;
}
export async function handleAdminInvitation(request: Request, env: AuthEnv) {
  if (!env.DB) return Response.json({ error: "Servicio no disponible." }, { status: 503 });
  const body = request.method === "POST" ? await readJsonBody(request, 4096) : null;
  if (request.method === "POST" && body?.action === "start") {
    if (!await limited(request, env, "invite_start")) return Response.json({ error: "Demasiados intentos. Prueba más tarde." }, { status: 429 });
    if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) return Response.json({ error: "Enlace inválido, revocado o vencido." }, { status: 400 });
    const invitation = await env.DB.prepare("SELECT id, github_id, github_login, email, invited_by, expires_at FROM admin_invitations WHERE token_hash = ? AND status = 'pending' AND expires_at > ?").bind(await adminTokenHash(body.token), Date.now()).first<Invitation>();
    if (!invitation) return Response.json({ error: "Enlace inválido, revocado o vencido." }, { status: 410 });
    return startGitHub(request, env, invitation);
  }
  const token = cookieValue(request, "juris_admin_accept");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return Response.json({ error: "Primero verifica tu cuenta con GitHub." }, { status: 401 });
  const hash = await adminTokenHash(token);
  const proof = await env.DB.prepare("SELECT * FROM admin_acceptance_proofs WHERE token_hash = ? AND expires_at > ?").bind(hash, Date.now()).first<Proof>();
  const invitation = proof ? await pendingInvitation(env, proof.invitation_id) : null;
  if (!proof || !invitation || proof.github_id !== invitation.github_id || proof.email !== invitation.email) return Response.json({ error: "La verificación venció o la invitación fue revocada." }, { status: 410 });
  if (request.method === "GET") return Response.json({ login: proof.github_login, email: proof.email, invitedBy: invitation.invited_by, expiresAt: Math.min(proof.expires_at, invitation.expires_at) });
  if (request.method !== "POST" || body?.action !== "accept" || body.confirmAccess !== true) return Response.json({ error: "Debes aceptar explícitamente la invitación." }, { status: 400 });
  const now = Date.now();
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE admin_invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_proof = ? WHERE id = ? AND status = 'pending' AND expires_at > ? AND EXISTS (SELECT 1 FROM admin_acceptance_proofs WHERE token_hash = ? AND expires_at > ?) AND (SELECT COUNT(*) FROM github_administrators WHERE status = 'active') < 20").bind(hash, invitation.id, now, hash, now),
    env.DB.prepare("INSERT INTO github_administrators (github_id, github_login, email, role, invited_by, accepted_at) SELECT github_id, ?, email, 'admin', invited_by, CURRENT_TIMESTAMP FROM admin_invitations WHERE id = ? AND status = 'accepted' AND accepted_proof = ? AND EXISTS (SELECT 1 FROM admin_acceptance_proofs WHERE token_hash = ?) ON CONFLICT(github_id) DO UPDATE SET github_login = excluded.github_login, email = excluded.email, status = 'active', invited_by = excluded.invited_by, accepted_at = CURRENT_TIMESTAMP, revoked_at = NULL WHERE github_administrators.role = 'admin'").bind(proof.github_login, invitation.id, hash, hash),
    env.DB.prepare("INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json) SELECT ?, ?, 'admin_invitation.accept', 'github_administrator', ?, '{}' FROM admin_invitations WHERE id = ? AND accepted_proof = ? AND EXISTS (SELECT 1 FROM admin_acceptance_proofs WHERE token_hash = ?)").bind(crypto.randomUUID(), proof.github_login, String(proof.github_id), invitation.id, hash, hash),
    env.DB.prepare("DELETE FROM admin_acceptance_proofs WHERE invitation_id = ?").bind(invitation.id),
  ]);
  if (result[0].meta?.changes !== 1) return Response.json({ error: "La invitación ya no está disponible." }, { status: 409 });
  const session = await createSession(proof.github_login, env, request);
  const headers = new Headers(); headers.append("Set-Cookie", clearCookie("juris_admin_accept")); headers.append("Set-Cookie", cookie("juris_admin", session, 28800));
  return Response.json({ accepted: true, redirect: "/admin/" }, { headers });
}
