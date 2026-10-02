import { clearUserSessionCookie, requireUser, verifyPassword, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
interface Context { request: Request; env: UserAuthEnv }
export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const password = typeof body?.password === "string" ? body.password : "";
  if (body?.action !== "disable" || !password) return Response.json({ error: "Confirma tu contraseña." }, { status: 400 });
  const user = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ? LIMIT 1").bind(session.id).first<{ password_hash: string | null }>();
  if (!user?.password_hash || !await verifyPassword(password, user.password_hash)) return Response.json({ error: "Contraseña incorrecta." }, { status: 403 });
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = 'suspended', session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.id),
    env.DB.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(session.id),
  ]);
  return Response.json({ disabled: true }, { headers: { "Set-Cookie": clearUserSessionCookie() } });
};
export const onRequestDelete = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const password = typeof body?.password === "string" ? body.password : "";
  if (body?.confirmation !== "ELIMINAR" || !password) return Response.json({ error: "Escribe ELIMINAR y confirma tu contraseña." }, { status: 400 });
  const user = await env.DB.prepare("SELECT password_hash, role FROM users WHERE id = ? LIMIT 1").bind(session.id).first<{ password_hash: string | null; role: string }>();
  if (!user?.password_hash || !await verifyPassword(password, user.password_hash)) return Response.json({ error: "Contraseña incorrecta." }, { status: 403 });
  await env.DB.batch([
    env.DB.prepare("UPDATE legal_cases SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE status = 'matched' AND id IN (SELECT case_id FROM case_proposals WHERE lawyer_id = ? AND status = 'accepted')").bind(session.id),
    env.DB.prepare("INSERT INTO account_deletion_log (id, deleted_role, initiated_by) VALUES (?, ?, 'self')").bind(crypto.randomUUID(), user.role),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(session.id),
  ]);
  return Response.json({ deleted: true }, { headers: { "Set-Cookie": clearUserSessionCookie() } });
};
