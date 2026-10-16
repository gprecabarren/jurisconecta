import { isAdmin } from "../../_lib/admin-auth";
import { adminAuditStatement } from "../../_lib/admin-audit";
import { readJsonBody } from "../../_lib/http";
import type { AuthEnv } from "../../_lib/github-auth";
import type { D1Database } from "../../_lib/user-auth";

type ManagedUser = { email: string; role: string; status: string; session_version: number; application_status: string | null };

async function changeRole(request: Request, env: AuthEnv, db: D1Database, body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id : "";
  const role = body.role === "person" || body.role === "lawyer" ? body.role : null;
  const expectedRole = body.expectedRole === "person" || body.expectedRole === "lawyer" ? body.expectedRole : null;
  const expectedVersion = body.expectedVersion;
  if (!id || !role || !expectedRole || !Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0 || role === expectedRole || body.confirmConsequences !== true) {
    return Response.json({ error: "Elige un rol distinto (cliente o abogado) y confirma las consecuencias del cambio." }, { status: 400 });
  }
  const user = await db.prepare("SELECT u.email, u.role, u.status, u.session_version, lp.application_status FROM users u LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.id = ? LIMIT 1").bind(id).first<ManagedUser>();
  if (!user || !["person", "lawyer"].includes(user.role)) return Response.json({ error: "Cuenta no disponible para cambiar su rol." }, { status: 404 });
  if (body.confirmEmail !== user.email) return Response.json({ error: "Escribe el correo exacto de la cuenta para confirmar el cambio de rol." }, { status: 400 });
  if (user.role !== expectedRole || user.session_version !== expectedVersion) return Response.json({ error: "La cuenta cambió desde que la abriste. Recarga el detalle antes de continuar." }, { status: 409 });
  const status = user.status === "suspended" ? "suspended" : role === "person" || user.application_status === "approved" ? "active" : "pending";
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO account_transaction_guards (id, valid) SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM users u LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.id = ? AND u.email = ? AND u.role = ? AND u.session_version = ? AND u.status = ? AND COALESCE(lp.application_status, '') = ?) THEN 1 ELSE 0 END").bind(guard, id, user.email, expectedRole, expectedVersion, user.status, user.application_status || ""),
      db.prepare("UPDATE users SET role = ?, status = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = ? AND session_version = ?").bind(role, status, id, expectedRole, expectedVersion),
      // Historical profiles, approvals, applications, cases and credits are kept.
      // A first conversion creates only an unapproved draft, with NO free grant.
      db.prepare("INSERT OR IGNORE INTO lawyer_profiles (user_id, subscription_status, plan_code, application_status) SELECT ?, 'none', 'silver', 'draft' WHERE ? = 'lawyer'").bind(id, role),
      db.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(id),
      await adminAuditStatement(request, env, db, "user.change_role", "user", id, { previousRole: expectedRole, newRole: role, previousStatus: user.status, newStatus: status, previousVersion: expectedVersion, newVersion: Number(expectedVersion) + 1, allSessionsRevoked: true, historicalDataPreserved: true }),
      db.prepare("DELETE FROM account_transaction_guards WHERE id = ?").bind(guard),
    ]);
  } catch {
    return Response.json({ error: "No se aplicó el cambio. La cuenta pudo actualizarse en otra sesión; recarga el detalle y vuelve a intentarlo." }, { status: 409 });
  }
  return Response.json({ saved: true, role, status, sessionVersion: Number(expectedVersion) + 1, sessionsRevoked: true });
}
export const onRequestGet = async ({ request, env }: { request: Request; env: AuthEnv }) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const user = await env.DB.prepare("SELECT u.id, u.full_name, u.email, u.role, u.status, u.session_version, u.phone, u.region, u.commune, u.auth_provider, u.created_at, u.updated_at, lp.specialties_json, lp.bio, lp.plan_code, lp.credit_balance, lp.application_status, la.rut, la.university, la.graduation_date FROM users u LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id LEFT JOIN lawyer_applications la ON la.user_id = u.id WHERE u.id = ? LIMIT 1").bind(id).first();
    if (!user) return Response.json({ error: "Cuenta no encontrada." }, { status: 404 });
    const cases = await env.DB.prepare("SELECT c.id, c.title, c.category, c.status, c.created_at, c.description FROM legal_cases c WHERE c.person_id = ? OR EXISTS (SELECT 1 FROM case_proposals p WHERE p.case_id = c.id AND p.lawyer_id = ?) ORDER BY c.created_at DESC LIMIT 100").bind(id, id).all();
    return Response.json({ user, cases: cases.results }, { headers: { "Cache-Control": "no-store" } });
  }
  const offset = Math.min(Math.max(Number(new URL(request.url).searchParams.get("offset")) || 0, 0), 100_000);
  const users = await env.DB.prepare("SELECT u.id, u.full_name, u.email, u.role, u.status, u.phone, u.region, u.commune, u.created_at, lp.application_status, (SELECT COUNT(*) FROM legal_cases c WHERE c.person_id = u.id) AS case_count, (SELECT COUNT(*) FROM case_proposals p WHERE p.lawyer_id = u.id) AS proposal_count FROM users u LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id ORDER BY u.created_at DESC LIMIT 100 OFFSET ?").bind(offset).all();
  return Response.json({ users: users.results, nextOffset: users.results.length === 100 ? offset + 100 : null }, { headers: { "Cache-Control": "no-store" } });
};
export const onRequestPatch = async ({ request, env }: { request: Request; env: AuthEnv }) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request);
  if (!body) return Response.json({ error: "Solicitud inválida o demasiado grande." }, { status: 400 });
  if (body.action === "change_role") return changeRole(request, env, env.DB, body);
  if (body.role !== undefined || body.action !== undefined) return Response.json({ error: "Acción de administración inválida." }, { status: 400 });
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status === "suspended" || body?.status === "active" ? body.status : null;
  if (!id || !status) return Response.json({ error: "Cuenta o estado inválido." }, { status: 400 });
  const user = await env.DB.prepare("SELECT role, status FROM users WHERE id = ? LIMIT 1").bind(id).first<{ role: string; status: string }>();
  if (!user || user.role === "admin") return Response.json({ error: "Cuenta no disponible." }, { status: 404 });
  if (user.status === status) return Response.json({ saved: true });
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id),
    env.DB.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(id),
    await adminAuditStatement(request, env, env.DB, status === "suspended" ? "user.disable" : "user.enable", "user", id, { previousStatus: user.status, newStatus: status }),
  ]);
  return Response.json({ saved: true });
};
export const onRequestDelete = async ({ request, env }: { request: Request; env: AuthEnv }) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const user = await env.DB.prepare("SELECT email, role FROM users WHERE id = ? LIMIT 1").bind(id).first<{ email: string; role: string }>();
  if (!user || user.role === "admin" || body?.confirmEmail !== user.email) return Response.json({ error: "Confirma el correo exacto antes de eliminar la cuenta." }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare("UPDATE legal_cases SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE status = 'matched' AND id IN (SELECT case_id FROM case_proposals WHERE lawyer_id = ? AND status = 'accepted')").bind(id),
    env.DB.prepare("INSERT INTO account_deletion_log (id, deleted_role, initiated_by) VALUES (?, ?, 'admin')").bind(crypto.randomUUID(), user.role),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
    await adminAuditStatement(request, env, env.DB, "user.delete", "user", id, { role: user.role }),
  ]);
  return Response.json({ deleted: true });
};
