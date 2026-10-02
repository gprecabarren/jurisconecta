import { isAdmin } from "../../_lib/admin-auth";
import { randomToken, readSession, type AuthEnv } from "../../_lib/github-auth";
import type { D1Database } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { adminAuditStatement } from "../../_lib/admin-audit";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }

async function tokenHash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const onRequestGet = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const requests = await env.DB.prepare("SELECT r.id, r.status, r.created_at, r.issued_at, r.expires_at, u.full_name, u.email, u.role FROM password_reset_requests r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 50").all();
  return Response.json({ requests: requests.results }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action === "issue" || body?.action === "cancel" ? body.action : null;
  if (!id || !action) return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  const pending = await env.DB.prepare("SELECT status FROM password_reset_requests WHERE id = ? LIMIT 1").bind(id).first<{ status: string }>();
  if (pending?.status !== "pending") return Response.json({ error: "La solicitud ya fue procesada." }, { status: 409 });
  if (action === "cancel") {
    await env.DB.batch([
      env.DB.prepare("UPDATE password_reset_requests SET status = 'cancelled' WHERE id = ? AND status = 'pending'").bind(id),
      await adminAuditStatement(request, env, env.DB, "recovery.cancel", "recovery_request", id),
    ]);
    return Response.json({ saved: true });
  }
  const note = typeof body?.verificationNote === "string" ? body.verificationNote.trim().slice(0, 500) : "";
  if (note.length < 20 || body?.verifiedIdentity !== true) return Response.json({ error: "Confirma la identidad fuera del sitio y registra cómo la verificaste, sin copiar documentos ni claves." }, { status: 400 });
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "Sesión vencida." }, { status: 401 });
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("UPDATE password_reset_requests SET status = 'issued', token_hash = ?, expires_at = datetime('now', '+30 minutes'), issued_at = CURRENT_TIMESTAMP, verification_note = ?, issued_by = ? WHERE id = ? AND status = 'pending'").bind(await tokenHash(token), note, `github:${admin.login}`, id),
    await adminAuditStatement(request, env, env.DB, "recovery.issue", "recovery_request", id, { verificationRecorded: true }),
  ]);
  return Response.json({ issued: true, oneTimeCode: token, expiresInMinutes: 30 }, { headers: { "Cache-Control": "no-store" } });
};
