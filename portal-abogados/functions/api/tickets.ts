import { requireUser, type UserAuthEnv } from "../_lib/user-auth";
import { readJsonBody } from "../_lib/http";
import { casePermission, listCursor, mutationReplay, nextListCursor, pageLimit, requestKey, supportCases, supportCategories, supportHash, supportJson, supportText, supportThread, supportWriteError, versionNumber, type SupportTicket } from "../_lib/support";

interface Context { request: Request; env: UserAuthEnv; }
const publicColumns = "id, subject, category, status, case_id, created_at, updated_at, version";

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return supportJson({ error: "Base de datos no disponible." }, 503);
  const session = await requireUser(request, env);
  if (!session) return supportJson({ error: "Inicia sesión para ver tus tickets." }, 401);
  const params = new URL(request.url).searchParams, ticketId = params.get("ticketId");
  if (ticketId) {
    const ticket = await env.DB.prepare(`SELECT ${publicColumns} FROM support_tickets WHERE id = ? AND user_id = ?`).bind(ticketId, session.id).first();
    if (!ticket) return supportJson({ error: "Ticket no encontrado." }, 404);
    const thread = await supportThread(env.DB, ticketId, params, false);
    return thread ? supportJson({ ticket, ...thread }) : supportJson({ error: "Cursor de conversación inválido." }, 400);
  }
  const cursorText = params.get("cursor"), cursor = listCursor(cursorText), limit = pageLimit(params);
  if (cursorText && !cursor) return supportJson({ error: "Cursor de bandeja inválido." }, 400);
  const values: unknown[] = [session.id];
  let sql = `SELECT ${publicColumns} FROM support_tickets WHERE user_id = ?`;
  if (cursor) { sql += " AND (created_at < ? OR (created_at = ? AND id < ?))"; values.push(cursor.createdAt, cursor.createdAt, cursor.id); }
  const [rows, cases] = await Promise.all([
    env.DB.prepare(`${sql} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...values, limit + 1).all<{ id: string; created_at: string }>(),
    supportCases(env.DB, session, params),
  ]);
  if (!cases) return supportJson({ error: "Cursor de casos inválido." }, 400);
  return supportJson({ tickets: rows.results.slice(0, limit), nextCursor: nextListCursor(rows.results, limit), ...cases });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return supportJson({ error: "Base de datos no disponible." }, 503);
  const session = await requireUser(request, env);
  if (!session) return supportJson({ error: "Inicia sesión para crear un ticket." }, 401);
  const body = await readJsonBody(request, 20_480);
  const subject = supportText(body?.subject, 8, 120), category = supportText(body?.category, 1, 30), message = supportText(body?.message, 30, 4000), key = requestKey(body?.requestId);
  const caseId = body?.caseId == null || body.caseId === "" ? null : supportText(body.caseId, 1, 80);
  if (!subject || !category || !supportCategories.has(category) || !message || !key || (body?.caseId && !caseId)) return supportJson({ error: "Completa asunto (8–120), categoría, descripción (30–4000 caracteres) y una clave de envío válida." }, 400);
  const hash = await supportHash({ subject, category, message, caseId });
  const replay = async () => {
    const prior = await env.DB!.prepare("SELECT id, create_payload_hash FROM support_tickets WHERE user_id = ? AND create_request_key = ?").bind(session.id, key).first<{ id: string; create_payload_hash: string }>();
    return prior ? prior.create_payload_hash === hash ? supportJson({ id: prior.id, status: "open", replayed: true }) : supportJson({ error: "La clave de envío ya corresponde a otro ticket." }, 409) : null;
  };
  const prior = await replay(); if (prior) return prior;
  if (caseId) {
    const permission = casePermission(session);
    const related = await env.DB.prepare(`SELECT c.id FROM legal_cases c WHERE c.id = ? AND ${permission.sql}`).bind(caseId, ...permission.values).first();
    if (!related) return supportJson({ error: "Solo puedes vincular un caso propio como cliente o un caso con tu propuesta aceptada como abogado aprobado." }, 403);
  }
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_tickets (id, user_id, subject, category, case_id, last_user_message_at, create_request_key, create_payload_hash) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)").bind(id, session.id, subject, category, caseId, key, hash),
      env.DB.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author, body) VALUES (?, ?, 'user', ?)").bind(crypto.randomUUID(), id, message),
    ]);
  } catch (error) { const retry = await replay(); return retry || supportWriteError(error); }
  return supportJson({ id, status: "open", version: 0 }, 201);
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return supportJson({ error: "Base de datos no disponible." }, 503);
  const session = await requireUser(request, env);
  if (!session) return supportJson({ error: "No autorizado." }, 401);
  const body = await readJsonBody(request, 20_480);
  const ticketId = supportText(body?.ticketId, 1, 80), message = supportText(body?.message, 10, 4000), key = requestKey(body?.requestId), version = versionNumber(body?.expectedVersion);
  const action = body?.action === "reopen" ? "reopen" : body?.action === "reply" || body?.action === undefined ? "reply" : null;
  if (!ticketId || !message || !key || version === null || !action) return supportJson({ error: "Escribe una respuesta de 10 a 4000 caracteres y actualiza la conversación antes de enviarla." }, 400);
  const actorKey = `user:${session.id}`, hash = await supportHash({ ticketId, message, version, action });
  const prior = await mutationReplay(env.DB, actorKey, key, hash); if (prior) return prior;
  const ticket = await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(ticketId, session.id).first<SupportTicket>();
  if (!ticket) return supportJson({ error: "Ticket no encontrado." }, 404);
  if (ticket.status === "closed" && action !== "reopen") return supportJson({ error: "Reabre el ticket para volver a escribir." }, 409);
  try {
    await env.DB.prepare("INSERT INTO support_mutations (id, ticket_id, actor_key, actor_kind, actor_id, request_key, payload_hash, expected_version, action, target_status, target_priority, target_assignee, body, visibility) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, 'open', ?, ?, ?, 'public')")
      .bind(crypto.randomUUID(), ticketId, actorKey, session.id, key, hash, version, action, ticket.priority, ticket.assigned_github_id, message).run();
  } catch (error) { const retry = await mutationReplay(env.DB, actorKey, key, hash); return retry || supportWriteError(error); }
  return supportJson({ saved: true, ticketId, version: version + 1 });
};
