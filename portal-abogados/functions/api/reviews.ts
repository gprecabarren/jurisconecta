import { cleanText, requireUser, type UserAuthEnv } from "../_lib/user-auth";
import { readJsonBody } from "../_lib/http";
import { notifyUser } from "../_lib/notifications";

interface Context { request: Request; env: UserAuthEnv; }

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (session.role !== "person" && session.role !== "lawyer") return Response.json({ error: "Rol inválido." }, { status: 403 });
  const column = session.role === "lawyer" ? "lawyer_id" : "person_id";
  const reviews = await env.DB.prepare(`SELECT r.id, r.case_id, r.rating, r.comment, r.created_at, c.title AS case_title FROM case_reviews r JOIN legal_cases c ON c.id = r.case_id WHERE r.${column} = ? ORDER BY r.created_at DESC LIMIT 100`).bind(session.id).all();
  return Response.json({ reviews: reviews.results }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env, "person");
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  const caseId = cleanText(body?.caseId, 80);
  const rating = Number(body?.rating);
  const comment = cleanText(body?.comment, 1000);
  if (!caseId || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 20) return Response.json({ error: "Selecciona de una a cinco estrellas y escribe al menos 20 caracteres." }, { status: 400 });
  const accepted = await env.DB.prepare("SELECT p.lawyer_id FROM legal_cases c JOIN case_proposals p ON p.case_id = c.id AND p.status = 'accepted' WHERE c.id = ? AND c.person_id = ? AND c.status = 'closed' LIMIT 1").bind(caseId, session.id).first<{ lawyer_id: string }>();
  if (!accepted) return Response.json({ error: "Solo puedes evaluar al profesional aceptado después de cerrar el caso." }, { status: 403 });
  try { await env.DB.prepare("INSERT INTO case_reviews (id, case_id, person_id, lawyer_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), caseId, session.id, accepted.lawyer_id, rating, comment).run(); }
  catch { return Response.json({ error: "Ya existe una evaluación para este caso." }, { status: 409 }); }
  await notifyUser(env.DB, accepted.lawyer_id, "case", "Recibiste una evaluación", "Una persona evaluó su experiencia tras cerrar el caso.", "/evaluaciones/");
  return Response.json({ saved: true }, { status: 201 });
};
