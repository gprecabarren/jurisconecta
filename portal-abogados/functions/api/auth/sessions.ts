import { clearUserSessionCookie, requireUser, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
interface Context { request: Request; env: UserAuthEnv }
export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const rows = await env.DB.prepare("SELECT id, device, location, ip_hint, created_at, last_seen_at FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 100").bind(session.id).all();
  return Response.json({ sessions: rows.results, currentSessionId: session.sessionId }, { headers: { "Cache-Control": "no-store" } });
};
export const onRequestDelete = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "Sesión inválida." }, { status: 400 });
  const result = await env.DB.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL").bind(id, session.id).run();
  if (!result.meta?.changes) return Response.json({ error: "Sesión no encontrada." }, { status: 404 });
  return Response.json({ revoked: true }, { headers: id === session.sessionId ? { "Set-Cookie": clearUserSessionCookie(), "Cache-Control": "no-store" } : { "Cache-Control": "no-store" } });
};
