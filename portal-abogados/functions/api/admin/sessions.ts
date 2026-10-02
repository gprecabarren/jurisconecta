import { isAdmin } from "../../_lib/admin-auth";
import { clearCookie, readSession, type AuthEnv } from "../../_lib/github-auth";
import { readJsonBody } from "../../_lib/http";
import { adminAuditStatement } from "../../_lib/admin-audit";
interface Context { request: Request; env: AuthEnv }
export const onRequestGet = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401 });
  const rows = await env.DB.prepare("SELECT id, device, location, ip_hint, created_at, last_seen_at FROM admin_sessions WHERE github_login = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 100").bind(admin.login).all();
  return Response.json({ sessions: rows.results, currentSessionId: admin.sessionId }, { headers: { "Cache-Control": "no-store" } });
};
export const onRequestDelete = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "Sesión inválida." }, { status: 400 });
  const existing = await env.DB.prepare("SELECT id FROM admin_sessions WHERE id = ? AND github_login = ? AND revoked_at IS NULL LIMIT 1").bind(id, admin.login).first();
  if (!existing) return Response.json({ error: "Sesión no encontrada." }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND github_login = ? AND revoked_at IS NULL").bind(id, admin.login),
    await adminAuditStatement(request, env, env.DB, "admin_session.revoke", "admin_session", id, { current: id === admin.sessionId }),
  ]);
  return Response.json({ revoked: true }, { headers: id === admin.sessionId ? { "Set-Cookie": clearCookie("juris_admin"), "Cache-Control": "no-store" } : { "Cache-Control": "no-store" } });
};
