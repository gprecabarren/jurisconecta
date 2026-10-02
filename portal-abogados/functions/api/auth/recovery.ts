import { hashPassword, normalizeEmail, validPassword, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";

interface Context { request: Request; env: UserAuthEnv; }

async function tokenHash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request);
  const email = normalizeEmail(typeof body?.email === "string" ? body.email.slice(0, 180) : "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Ingresa un correo válido." }, { status: 400 });
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND auth_provider = 'password' LIMIT 1").bind(email).first<{ id: string }>();
  if (user) {
    const recent = await env.DB.prepare("SELECT id FROM password_reset_requests WHERE user_id = ? AND created_at >= datetime('now', '-1 day') LIMIT 1").bind(user.id).first();
    if (!recent) await env.DB.prepare("INSERT INTO password_reset_requests (id, user_id) VALUES (?, ?)").bind(crypto.randomUUID(), user.id).run();
  }
  return Response.json({ requested: true, message: "Si existe la cuenta, soporte revisará tu solicitud. No enviamos códigos automáticos: primero validamos tu identidad." }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request);
  const email = normalizeEmail(typeof body?.email === "string" ? body.email.slice(0, 180) : "");
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^[A-Za-z0-9_-]{32}$/.test(token) || !validPassword(password)) return Response.json({ error: "Revisa el correo, código y nueva contraseña." }, { status: 400 });
  const hash = await tokenHash(token);
  const reset = await env.DB.prepare("SELECT r.id, r.user_id FROM password_reset_requests r JOIN users u ON u.id = r.user_id WHERE u.email = ? AND r.token_hash = ? AND r.status = 'issued' AND r.expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(email, hash).first<{ id: string; user_id: string }>();
  if (!reset) return Response.json({ error: "Código inválido o vencido." }, { status: 403 });
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND EXISTS (SELECT 1 FROM password_reset_requests WHERE id = ? AND token_hash = ? AND status = 'issued' AND expires_at > CURRENT_TIMESTAMP)").bind(await hashPassword(password), reset.user_id, reset.id, hash),
    env.DB.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM password_reset_requests WHERE id = ? AND token_hash = ? AND status = 'issued' AND expires_at > CURRENT_TIMESTAMP)").bind(reset.user_id, reset.id, hash),
    env.DB.prepare("UPDATE password_reset_requests SET status = 'used', used_at = CURRENT_TIMESTAMP, token_hash = NULL WHERE id = ? AND status = 'issued'").bind(reset.id),
    env.DB.prepare("UPDATE password_reset_requests SET status = 'cancelled', token_hash = NULL WHERE user_id = ? AND id != ? AND status IN ('pending', 'issued')").bind(reset.user_id, reset.id),
  ]) as Array<{ meta?: { changes?: number } }>;
  if (!results[0]?.meta?.changes) return Response.json({ error: "Código inválido o ya utilizado." }, { status: 403 });
  return Response.json({ reset: true }, { headers: { "Cache-Control": "no-store" } });
};
