import { cleanText, requireUser, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { notifyUser } from "../../_lib/notifications";

interface Context { request: Request; env: UserAuthEnv; }
type Proposal = { id: string; case_id: string; case_title: string; category: string; message: string; fee_amount: number | null; status: string; created_at: string; credit_cost: number; };

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const rows = await env.DB.prepare("SELECT p.id, p.case_id, c.title AS case_title, c.category, p.message, p.fee_amount, p.status, p.created_at, c.credit_cost FROM case_proposals p JOIN legal_cases c ON c.id = p.case_id WHERE p.lawyer_id = ? ORDER BY p.created_at DESC LIMIT 100").bind(session.id).all<Proposal>();
  return Response.json({ proposals: rows.results }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const caseId = cleanText(body?.caseId, 80);
  const message = cleanText(body?.message, 1500);
  const fee = body?.feeAmount === null || body?.feeAmount === "" || body?.feeAmount === undefined ? null : Number(body.feeAmount);
  if (!caseId || message.length < 30 || (fee !== null && (!Number.isInteger(fee) || fee < 0 || fee > 100_000_000))) return Response.json({ error: "Escribe una propuesta de 30 a 1500 caracteres y un honorario válido, si corresponde." }, { status: 400 });
  const profile = await env.DB.prepare("SELECT lp.application_status, u.status FROM lawyer_profiles lp JOIN users u ON u.id = lp.user_id WHERE lp.user_id = ? LIMIT 1").bind(session.id).first<{ application_status: string; status: string }>();
  if (profile?.application_status !== "approved" || profile.status !== "active") return Response.json({ error: "Debes estar aprobado para proponer." }, { status: 403 });
  const legalCase = await env.DB.prepare("SELECT person_id, status FROM legal_cases WHERE id = ? LIMIT 1").bind(caseId).first<{ person_id: string; status: string }>();
  if (!legalCase || legalCase.status !== "open") return Response.json({ error: "El caso ya no recibe propuestas." }, { status: 409 });
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO case_proposals (id, case_id, lawyer_id, message, fee_amount) VALUES (?, ?, ?, ?, ?)").bind(id, caseId, session.id, message, fee).run();
  } catch {
    return Response.json({ error: "Ya enviaste una propuesta o se alcanzó el límite de tres." }, { status: 409 });
  }
  await notifyUser(env.DB, legalCase.person_id, "case", "Recibiste una propuesta", "Revisa los antecedentes del abogado y decide si quieres continuar.", `/cliente/caso/?id=${encodeURIComponent(caseId)}`);
  return Response.json({ id, status: "sent" }, { status: 201, headers: { "Cache-Control": "no-store" } });
};
