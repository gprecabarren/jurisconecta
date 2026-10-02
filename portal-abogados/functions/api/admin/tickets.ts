import { isAdmin } from "../../_lib/admin-auth";
import type { AuthEnv } from "../../_lib/github-auth";
import type { D1Database } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { notifyUser } from "../../_lib/notifications";
import { adminAuditStatement } from "../../_lib/admin-audit";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }
const statuses = new Set(["open", "waiting_user", "resolved", "closed"]);

export const onRequestGet = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const tickets = await env.DB.prepare("SELECT t.id, t.user_id, t.subject, t.category, t.status, t.case_id, t.created_at, t.updated_at, u.full_name, u.email, u.role FROM support_tickets t JOIN users u ON u.id = t.user_id ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'waiting_user' THEN 1 ELSE 2 END, t.updated_at DESC LIMIT 100").all();
  const messages = await env.DB.prepare("SELECT m.id, m.ticket_id, m.author, m.body, m.created_at FROM support_ticket_messages m JOIN support_tickets t ON t.id = m.ticket_id ORDER BY m.created_at ASC LIMIT 1000").all();
  return Response.json({ tickets: tickets.results, messages: messages.results }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request, 8_192);
  const ticketId = typeof body?.ticketId === "string" ? body.ticketId : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!ticketId || !statuses.has(status) || (message && message.length < 10)) return Response.json({ error: "Indica un estado válido y una respuesta de al menos 10 caracteres, si corresponde." }, { status: 400 });
  const ticket = await env.DB.prepare("SELECT user_id FROM support_tickets WHERE id = ? LIMIT 1").bind(ticketId).first<{ user_id: string }>();
  if (!ticket) return Response.json({ error: "Ticket no encontrado." }, { status: 404 });
  const statements = [env.DB.prepare("UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, ticketId)];
  if (message) statements.push(env.DB.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author, body) VALUES (?, ?, 'admin', ?)").bind(crypto.randomUUID(), ticketId, message));
  statements.push(await adminAuditStatement(request, env, env.DB, "ticket.update", "ticket", ticketId, { status, replied: Boolean(message) }));
  await env.DB.batch(statements);
  await notifyUser(env.DB, ticket.user_id, "support", "Tu ticket tiene novedades", message ? "Soporte respondió tu solicitud." : `El estado cambió a ${status}.`, "/soporte/#mis-tickets");
  return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
};
