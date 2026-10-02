import { cleanText, D1Database, requireUser, UserAuthEnv } from "../_lib/user-auth";
import { legalAreas } from "../../shared/legal-catalog";
import { isChileRegion } from "../../shared/chile";

interface Context { request: Request; env: UserAuthEnv & { DB?: D1Database }; }
type CaseInput = { category?: unknown; topic?: unknown; situation?: unknown; desiredOutcome?: unknown; attentionMode?: unknown; region?: unknown; commune?: unknown; };
type CaseRow = { id: string; category: string; title: string; description: string; region: string | null; status: string; created_at: string; attention_mode: string | null; commune: string | null; view_count: number; proposal_count: number; accepted_count: number; };

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "person");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const cases = await env.DB.prepare("SELECT c.id, c.category, c.title, c.description, c.region, c.status, c.created_at, d.attention_mode, d.commune, COALESCE((SELECT COUNT(*) FROM case_views cv WHERE cv.case_id = c.id), 0) AS view_count, (SELECT COUNT(*) FROM case_proposals p WHERE p.case_id = c.id) AS proposal_count, (SELECT COUNT(*) FROM case_proposals p WHERE p.case_id = c.id AND p.status = 'accepted') AS accepted_count FROM legal_cases c LEFT JOIN case_details d ON d.case_id = c.id WHERE c.person_id = ? ORDER BY c.created_at DESC").bind(session.id).all<CaseRow>();
  return Response.json({ cases: cases.results });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "person");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const payload = await request.json() as CaseInput;
  const category = cleanText(payload.category, 80);
  const topic = cleanText(payload.topic, 120);
  const situation = cleanText(payload.situation, 3000);
  const desiredOutcome = cleanText(payload.desiredOutcome, 1000);
  const attentionMode = cleanText(payload.attentionMode, 40);
  const region = cleanText(payload.region, 80);
  const commune = cleanText(payload.commune, 80);
  const selectedArea = legalAreas.find((area) => area.title === category);
  if (!selectedArea || !selectedArea.topics.includes(topic)) return Response.json({ error: "Selecciona una materia y tipo de caso validos." }, { status: 400 });
  if (region && !isChileRegion(region)) return Response.json({ error: "Selecciona una region valida de Chile." }, { status: 400 });
  if (!category || !topic || situation.length < 30 || desiredOutcome.length < 10 || !attentionMode) return Response.json({ error: "Completa los detalles principales de tu caso." }, { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO legal_cases (id, person_id, category, title, description, region, status) VALUES (?, ?, ?, ?, ?, ?, 'open')").bind(id, session.id, category, topic, situation, region || null),
    env.DB.prepare("INSERT INTO case_details (case_id, topic, situation, desired_outcome, attention_mode, commune) VALUES (?, ?, ?, ?, ?, ?)").bind(id, topic, situation, desiredOutcome, attentionMode, commune || null),
  ]);
  return Response.json({ id, status: "open" }, { status: 201 });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "person");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const payload = await request.json() as { id?: unknown; action?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id || payload.action !== "close") return Response.json({ error: "Acción inválida." }, { status: 400 });
  const result = await env.DB.prepare("UPDATE legal_cases SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND person_id = ? AND status != 'closed'").bind(id, session.id).run();
  if (!result.meta?.changes) return Response.json({ error: "No pudimos cerrar este caso." }, { status: 404 });
  return Response.json({ closed: true });
};
