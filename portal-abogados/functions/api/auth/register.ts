import { cleanText, createUserSession, D1Database, hashPassword, loginDestination, normalizeEmail, UserAuthEnv, UserRole, userSessionCookie, validPassword } from "../../_lib/user-auth";
import { isChileRegion } from "../../../shared/chile";

interface Context { request: Request; env: UserAuthEnv & { DB?: D1Database }; }
type Registration = { fullName?: unknown; email?: unknown; password?: unknown; role?: unknown; phone?: unknown; region?: unknown; commune?: unknown; };

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const payload = await request.json() as Registration;
  const fullName = cleanText(payload.fullName, 120);
  const email = normalizeEmail(cleanText(payload.email, 180));
  const password = typeof payload.password === "string" ? payload.password : "";
  const requestedRole = payload.role === "lawyer" ? "lawyer" : "person";
  const role = requestedRole as UserRole;
  if (fullName.length < 3 || !/^\S+@\S+\.\S+$/.test(email) || !validPassword(password)) return Response.json({ error: "Revisa tu nombre, correo y contraseña." }, { status: 400 });
  const region = cleanText(payload.region, 80);
  if (region && !isChileRegion(region)) return Response.json({ error: "Selecciona una región válida de Chile." }, { status: 400 });
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (existing) return Response.json({ error: "Ya existe una cuenta con ese correo." }, { status: 409 });
  const id = crypto.randomUUID();
  const status = role === "lawyer" ? "pending" : "active";
  await env.DB.prepare("INSERT INTO users (id, email, full_name, role, status, password_hash, phone, region, commune, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'password')").bind(id, email, fullName, role, status, await hashPassword(password), cleanText(payload.phone, 30) || null, region || null, cleanText(payload.commune, 80) || null).run();
  if (role === "lawyer") await env.DB.prepare("INSERT INTO lawyer_profiles (user_id, subscription_status, plan_code, application_status) VALUES (?, 'none', 'silver', 'draft')").bind(id).run();
  const session = await createUserSession({ id, email, fullName, role, sessionVersion: 0 }, env, request);
  return Response.json({ destination: role === "lawyer" ? "/postulacion-abogado" : loginDestination(role), role }, { headers: { "Set-Cookie": userSessionCookie(session) } });
};
