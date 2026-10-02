import { cleanText, requireUser, type UserAuthEnv } from "../_lib/user-auth";
import { readJsonBody } from "../_lib/http";

interface Context { request: Request; env: UserAuthEnv; }
const categories = new Set(["account", "case", "technical", "privacy", "other"]);

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "Inicia sesión para ver tus tickets." }, { status: 401 });
  const tickets = await env.DB.prepare("SELECT id, subject, category, status, case_id, created_at, updated_at FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50").bind(session.id).all();
  const messages = await env.DB.prepare("SELECT m.id, m.ticket_id, m.author, m.body, m.created_at FROM support_ticket_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE t.user_id = ? ORDER BY m.created_at ASC LIMIT 500").bind(session.id).all();
  return Response.json({ tickets: tickets.results, messages: messages.results }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "Inicia sesión para crear un ticket." }, { status: 401 });
  const body = await readJsonBody(request, 8_192);
  const subject = cleanText(body?.subject, 120);
  const category = cleanText(body?.category, 30);
  const message = cleanText(body?.message, 4000);
  const caseId = cleanText(body?.caseId, 80) || null;
  if (subject.length < 8 || !categories.has(category) || message.length < 30) return Response.json({ error: "Ingresa un asunto de 8 caracteres, una categoría y una descripción de al menos 30 caracteres." }, { status: 400 });
  if (caseId) {
    const related = await env.DB.prepare("SELECT id FROM legal_cases WHERE id = ? AND person_id = ? LIMIT 1").bind(caseId, session.id).first();
    if (!related) return Response.json({ error: "No puedes vincular un caso ajeno." }, { status: 403 });
  }
  const rate = await env.DB.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE user_id = ? AND created_at >= datetime('now', '-1 day')").bind(session.id).first<{ count: number }>();
  if ((rate?.count || 0) >= 5) return Response.json({ error: "Alcanzaste el límite de cinco tickets por día. Responde uno existente o vuelve mañana." }, { status: 429 });
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO support_tickets (id, user_id, subject, category, case_id) VALUES (?, ?, ?, ?, ?)").bind(id, session.id, subject, category, caseId),
    env.DB.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author, body) VALUES (?, ?, 'user', ?)").bind(crypto.randomUUID(), id, message),
  ]);
  return Response.json({ id, status: "open" }, { status: 201, headers: { "Cache-Control": "no-store" } });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env);
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request, 8_192);
  const ticketId = cleanText(body?.ticketId, 80);
  const message = cleanText(body?.message, 4000);
  if (!ticketId || message.length < 10) return Response.json({ error: "Escribe una respuesta de al menos 10 caracteres." }, { status: 400 });
  const ticket = await env.DB.prepare("SELECT status FROM support_tickets WHERE id = ? AND user_id = ? LIMIT 1").bind(ticketId, session.id).first<{ status: string }>();
  if (!ticket || ticket.status === "closed") return Response.json({ error: "Ticket no encontrado o cerrado." }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author, body) VALUES (?, ?, 'user', ?)").bind(crypto.randomUUID(), ticketId, message),
    env.DB.prepare("UPDATE support_tickets SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(ticketId, session.id),
  ]);
  return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
};
