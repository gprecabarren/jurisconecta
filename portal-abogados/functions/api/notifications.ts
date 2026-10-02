import { cleanText, requireUser, type UserAuthEnv } from "../_lib/user-auth";
import { readJsonBody } from "../_lib/http";

interface Context { request: Request; env: UserAuthEnv; }

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const notices = await env.DB.prepare("SELECT id, category, title, body, href, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(session.id).all();
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(session.id).first<{ count: number }>();
  return Response.json({ notifications: notices.results, unread: count?.count || 0 }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const id = cleanText(body?.id, 80);
  if (!id) return Response.json({ error: "Notificación inválida." }, { status: 400 });
  const result = await env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?").bind(id, session.id).run();
  if (!result.meta?.changes) return Response.json({ error: "Notificación no encontrada." }, { status: 404 });
  return Response.json({ saved: true });
};
