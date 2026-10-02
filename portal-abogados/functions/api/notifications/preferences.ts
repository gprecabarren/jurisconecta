import { requireUser, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";

interface Context { request: Request; env: UserAuthEnv; }
type Preferences = { case_updates: number; support_updates: number; account_updates: number };

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const stored = await env.DB.prepare("SELECT case_updates, support_updates, account_updates FROM notification_preferences WHERE user_id = ? LIMIT 1").bind(session.id).first<Preferences>();
  return Response.json({ preferences: stored || { case_updates: 1, support_updates: 1, account_updates: 1 }, channels: ["in_app"] }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  if (!body || ["caseUpdates", "supportUpdates", "accountUpdates"].some((key) => typeof body[key] !== "boolean")) return Response.json({ error: "Preferencias inválidas." }, { status: 400 });
  await env.DB.prepare("INSERT INTO notification_preferences (user_id, case_updates, support_updates, account_updates) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET case_updates = excluded.case_updates, support_updates = excluded.support_updates, account_updates = excluded.account_updates, updated_at = CURRENT_TIMESTAMP").bind(session.id, body.caseUpdates ? 1 : 0, body.supportUpdates ? 1 : 0, body.accountUpdates ? 1 : 0).run();
  return Response.json({ saved: true, channels: ["in_app"] });
};
