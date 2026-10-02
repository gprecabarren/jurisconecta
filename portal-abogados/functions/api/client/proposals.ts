import { cleanText, requireUser, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { notifyUser } from "../../_lib/notifications";

interface Context { request: Request; env: UserAuthEnv; }
type CaseOwner = { id: string; status: string; };

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env, "person");
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const caseId = cleanText(new URL(request.url).searchParams.get("caseId"), 80);
  const owner = await env.DB.prepare("SELECT id, status FROM legal_cases WHERE id = ? AND person_id = ? LIMIT 1").bind(caseId, session.id).first<CaseOwner>();
  if (!owner) return Response.json({ error: "Caso no encontrado." }, { status: 404 });
  const proposals = await env.DB.prepare("SELECT p.id, p.case_id, p.message, p.fee_amount, p.status, p.created_at, u.full_name AS lawyer_name, u.avatar_data_url, u.region, lp.bio, lp.specialties_json, la.university, la.experience_years, COALESCE((SELECT AVG(rating) FROM case_reviews r WHERE r.lawyer_id = p.lawyer_id), 0) AS rating, (SELECT COUNT(*) FROM case_reviews r WHERE r.lawyer_id = p.lawyer_id) AS review_count FROM case_proposals p JOIN users u ON u.id = p.lawyer_id JOIN lawyer_profiles lp ON lp.user_id = p.lawyer_id LEFT JOIN lawyer_applications la ON la.user_id = p.lawyer_id WHERE p.case_id = ? ORDER BY p.created_at DESC").bind(caseId).all();
  return Response.json({ caseStatus: owner.status, proposals: proposals.results }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env, "person");
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const proposalId = cleanText(body?.proposalId, 80);
  const action = body?.action === "accept" || body?.action === "decline" ? body.action : null;
  if (!proposalId || !action) return Response.json({ error: "Acción inválida." }, { status: 400 });
  const proposal = await env.DB.prepare("SELECT p.case_id, p.lawyer_id, p.status, c.status AS case_status FROM case_proposals p JOIN legal_cases c ON c.id = p.case_id WHERE p.id = ? AND c.person_id = ? LIMIT 1").bind(proposalId, session.id).first<{ case_id: string; lawyer_id: string; status: string; case_status: string }>();
  if (!proposal || proposal.status !== "sent" || proposal.case_status !== "open") return Response.json({ error: "Esta propuesta ya no está disponible." }, { status: 409 });
  try {
    if (action === "accept") {
      await env.DB.batch([
        env.DB.prepare("UPDATE case_proposals SET status = 'accepted' WHERE id = ? AND status = 'sent'").bind(proposalId),
        env.DB.prepare("UPDATE case_proposals SET status = 'declined' WHERE case_id = ? AND id != ? AND status = 'sent'").bind(proposal.case_id, proposalId),
        env.DB.prepare("UPDATE legal_cases SET status = 'matched', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND person_id = ? AND status = 'open'").bind(proposal.case_id, session.id),
      ]);
    } else {
      await env.DB.prepare("UPDATE case_proposals SET status = 'declined' WHERE id = ? AND status = 'sent'").bind(proposalId).run();
    }
  } catch { return Response.json({ error: "La propuesta cambió de estado; actualiza la página." }, { status: 409 }); }
  await notifyUser(env.DB, proposal.lawyer_id, "case", action === "accept" ? "Tu propuesta fue aceptada" : "Tu propuesta no fue seleccionada", action === "accept" ? "Puedes desbloquear el contacto de esta persona desde tus propuestas." : "El cliente eligió no avanzar con esta propuesta.", "/casos/propuestas/");
  return Response.json({ saved: true, status: action === "accept" ? "accepted" : "declined" }, { headers: { "Cache-Control": "no-store" } });
};
