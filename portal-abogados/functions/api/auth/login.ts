import { createUserSession, D1Database, loginDestination, normalizeEmail, UserAuthEnv, UserRole, userSessionCookie, verifyPassword } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";

interface Context { request: Request; env: UserAuthEnv & { DB?: D1Database }; }
type Login = { email?: unknown; password?: unknown; };
type StoredUser = { id: string; email: string; full_name: string; role: UserRole; status: string; password_hash: string | null; session_version: number; };

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const payload = await readJsonBody(request,2000) as Login | null;
  if (!payload) return Response.json({error:"Solicitud inválida."},{status:400});
  const email = normalizeEmail(typeof payload.email === "string" ? payload.email : "");
  const password = typeof payload.password === "string" ? payload.password : "";
  const user = await env.DB.prepare("SELECT id, email, full_name, role, status, password_hash, session_version FROM users WHERE lower(trim(email)) = ? LIMIT 1").bind(email).first<StoredUser>();
  if (!user || !user.password_hash || !await verifyPassword(password, user.password_hash)) return Response.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  if (user.status === "suspended" || user.role === "admin") return Response.json({ error: "Esta cuenta no está disponible por esta vía. Contacta a soporte." }, { status: 403 });
  const session = await createUserSession({ id: user.id, email: user.email, fullName: user.full_name, role: user.role, sessionVersion: user.session_version }, env, request);
  const application = user.role === "lawyer" ? await env.DB.prepare("SELECT application_status FROM lawyer_profiles WHERE user_id = ? LIMIT 1").bind(user.id).first<{ application_status: string }>() : null;
  const destination = user.role === "lawyer" && (user.status !== "active" || application?.application_status !== "approved") ? "/postulacion-abogado" : loginDestination(user.role);
  return Response.json({ destination, role: user.role, status: user.status }, { headers: { "Set-Cookie": userSessionCookie(session) } });
};
