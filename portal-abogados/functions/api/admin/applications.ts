import { isAdmin } from "../../_lib/admin-auth";
import { readSession, type AuthEnv } from "../../_lib/github-auth";
import type { D1Database } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { adminAuditStatement } from "../../_lib/admin-audit";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }
type Application = { id: string; full_name: string; email: string; status: string; region: string | null; specialties: string; application_status: string; application_submitted_at: string | null; application_review_note: string | null; university: string | null; rut: string | null; selected_plan_code: string; document_count: number; verification_method: string | null; verified_at: string | null; };

export const onRequestGet = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const applications = await env.DB.prepare("SELECT u.id, u.full_name, u.email, u.status, u.region, COALESCE(lp.specialties_json, '[]') AS specialties, lp.application_status, lp.application_submitted_at, lp.application_review_note, la.university, la.rut, COALESCE(la.selected_plan_code, lp.plan_code) AS selected_plan_code, COUNT(d.id) AS document_count, lv.method AS verification_method, lv.reviewed_at AS verified_at FROM users u JOIN lawyer_profiles lp ON lp.user_id = u.id LEFT JOIN lawyer_applications la ON la.user_id = u.id LEFT JOIN lawyer_application_documents d ON d.user_id = u.id LEFT JOIN lawyer_verifications lv ON lv.lawyer_id = u.id WHERE u.role = 'lawyer' GROUP BY u.id ORDER BY CASE lp.application_status WHEN 'submitted' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, lp.application_submitted_at DESC").all<Application>();
  const documentRows = await env.DB.prepare("SELECT id, user_id, document_type, file_name FROM lawyer_application_documents ORDER BY created_at").all<{ id: string; user_id: string; document_type: string; file_name: string }>();
  return Response.json({ applications: applications.results, documents: documentRows.results });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const payload = await readJsonBody(request);
  const userId = typeof payload?.userId === "string" ? payload.userId : "";
  const decision = payload?.decision === "approve" ? "approve" : payload?.decision === "request_changes" ? "request_changes" : "";
  const note = typeof payload?.note === "string" ? payload.note.trim().slice(0, 1000) : "";
  if (!userId || !decision) return Response.json({ error: "Revisión inválida." }, { status: 400 });
  const current = await env.DB.prepare("SELECT application_status FROM lawyer_profiles WHERE user_id = ? LIMIT 1").bind(userId).first<{ application_status: string }>();
  if (current?.application_status !== "submitted") return Response.json({ error: "La postulación ya no está pendiente de revisión." }, { status: 409 });
  if (decision === "approve") {
    const method = payload?.verificationMethod === "video" || payload?.verificationMethod === "in_person" ? payload.verificationMethod : null;
    const evidenceNote = typeof payload?.evidenceNote === "string" ? payload.evidenceNote.trim().slice(0, 500) : "";
    if (!method || evidenceNote.length < 20 || payload?.verifiedOriginals !== true) return Response.json({ error: "Debes revisar los originales por video o presencialmente, registrar el método y confirmar la verificación." }, { status: 400 });
    const profile = await env.DB.prepare("SELECT lp.plan_code, p.monthly_credits FROM lawyer_profiles lp JOIN subscription_plans p ON p.code = lp.plan_code WHERE lp.user_id = ? LIMIT 1").bind(userId).first<{ plan_code: string; monthly_credits: number }>();
    if (!profile) return Response.json({ error: "No encontramos la postulación." }, { status: 404 });
    const admin = await readSession(request, env);
    if (!admin) return Response.json({ error: "Sesión administrativa vencida." }, { status: 401 });
    try { await env.DB.batch([
      env.DB.prepare("INSERT INTO lawyer_verifications (lawyer_id, method, evidence_note, reviewed_by) VALUES (?, ?, ?, ?)").bind(userId, method, evidenceNote, `github:${admin.login}`),
      env.DB.prepare("UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId),
      env.DB.prepare("UPDATE lawyer_profiles SET subscription_status = 'trial', credit_balance = ?, renewal_date = date('now', '+30 day'), application_status = 'approved', application_reviewed_at = CURRENT_TIMESTAMP, application_review_note = ? WHERE user_id = ?").bind(profile.monthly_credits, note || null, userId),
      env.DB.prepare("INSERT INTO lawyer_credit_ledger (id, lawyer_id, delta, balance_after, reason) VALUES (?, ?, ?, ?, 'monthly_allocation')").bind(crypto.randomUUID(), userId, profile.monthly_credits, profile.monthly_credits),
      await adminAuditStatement(request, env, env.DB, "lawyer.approve", "user", userId, { method, plan: profile.plan_code }),
    ]); } catch { return Response.json({ error: "No se pudo aprobar; revisa si la verificación ya fue registrada." }, { status: 409 }); }
  } else {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId),
      env.DB.prepare("UPDATE lawyer_profiles SET application_status = 'changes_requested', application_reviewed_at = CURRENT_TIMESTAMP, application_review_note = ? WHERE user_id = ?").bind(note || "Necesitamos que revises la información enviada.", userId),
      await adminAuditStatement(request, env, env.DB, "lawyer.request_changes", "user", userId),
    ]);
  }
  return Response.json({ saved: true });
};
