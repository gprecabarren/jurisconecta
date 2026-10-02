import { createUserSession, hashPassword, requireUser, userSessionCookie, validPassword, verifyPassword, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";

interface Context { request: Request; env: UserAuthEnv; }

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !validPassword(newPassword) || currentPassword === newPassword) return Response.json({ error: "La nueva contraseña debe tener entre 8 y 128 caracteres y ser distinta de la anterior." }, { status: 400 });
  const user = await env.DB.prepare("SELECT password_hash, session_version, full_name, email, role FROM users WHERE id = ? LIMIT 1").bind(session.id).first<{ password_hash: string | null; session_version: number; full_name: string; email: string; role: "person" | "lawyer" | "admin" }>();
  if (!user?.password_hash || !await verifyPassword(currentPassword, user.password_hash)) return Response.json({ error: "La contraseña actual no es correcta." }, { status: 403 });
  const version = user.session_version + 1;
  await env.DB.prepare("UPDATE users SET password_hash = ?, session_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(await hashPassword(newPassword), version, session.id).run();
  await env.DB.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(session.id).run();
  const token = await createUserSession({ id: session.id, email: user.email, fullName: user.full_name, role: user.role, sessionVersion: version }, env, request);
  return Response.json({ saved: true, otherSessionsClosed: true }, { headers: { "Set-Cookie": userSessionCookie(token), "Cache-Control": "no-store" } });
};
