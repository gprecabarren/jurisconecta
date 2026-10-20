import { readSession, type AuthEnv } from "../../_lib/github-auth";
import { readJsonBody } from "../../_lib/http";
import { listCursor, mutationReplay, nextListCursor, normalizeSupportSearch, pageLimit, requestKey, supportCategories, supportHash, supportJson, supportPriorities, supportStatuses, supportText, supportThread, supportWriteError, versionNumber, type SupportTicket } from "../../_lib/support";

interface Context { request: Request; env: AuthEnv; }
const lastReplySequence = "COALESCE((SELECT MAX(rowid) FROM support_ticket_messages WHERE ticket_id = t.id AND author = 'admin' AND visibility = 'public'), 0)";
const needsReply = `(t.status IN ('open', 'waiting_user') AND EXISTS (SELECT 1 FROM support_ticket_messages WHERE ticket_id = t.id AND author = 'user' AND rowid > ${lastReplySequence}))`;
const pendingSince = `(SELECT MIN(created_at) FROM support_ticket_messages WHERE ticket_id = t.id AND author = 'user' AND rowid > ${lastReplySequence})`;
const columns = `t.*, u.full_name, u.email, u.role, a.github_login AS assigned_login, c.title AS case_title, ${needsReply} AS needs_reply, ${pendingSince} AS pending_since`;
const joins = "FROM support_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN github_administrators a ON a.github_id = t.assigned_github_id LEFT JOIN legal_cases c ON c.id = t.case_id";

export const onRequestGet = async ({ request, env }: Context) => {
  const session = await readSession(request, env);
  if (!session?.githubId) return supportJson({ error: "No autorizado." }, 401);
  if (!env.DB) return supportJson({ error: "Base de datos no disponible." }, 503);
  const params = new URL(request.url).searchParams;
  if (params.get("alertsOnly") === "1") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM support_team_alerts e WHERE NOT EXISTS (SELECT 1 FROM support_alert_receipts r WHERE r.alert_id = e.id AND r.github_id = ?)").bind(session.githubId).first<{ n: number }>();
    return supportJson({ unreadAlerts: count?.n || 0 });
  }
  const ticketId = params.get("ticketId");
  if (ticketId) {
    const ticket = await env.DB.prepare(`SELECT ${columns} ${joins} WHERE t.id = ?`).bind(ticketId).first();
    if (!ticket) return supportJson({ error: "Ticket no encontrado." }, 404);
    const thread = await supportThread(env.DB, ticketId, params, true);
    return thread ? supportJson({ ticket, ...thread }) : supportJson({ error: "Cursor de conversación inválido." }, 400);
  }
  const cursorText = params.get("cursor"), cursor = listCursor(cursorText), limit = pageLimit(params);
  const status = params.get("status"), category = params.get("category"), role = params.get("role"), priority = params.get("priority"), assignment = params.get("assignment"), query = params.get("q")?.trim() || "";
  if ((cursorText && !cursor) || (status && !supportStatuses.has(status)) || (category && !supportCategories.has(category)) || (role && !["person", "lawyer"].includes(role)) || (priority && !supportPriorities.has(priority)) || query.length > 120 || (assignment && !["mine", "unassigned"].includes(assignment) && !/^\d{1,16}$/.test(assignment))) return supportJson({ error: "Filtro o cursor inválido." }, 400);
  const where = ["1 = 1"], values: unknown[] = [];
  for (const [column, value] of [["t.status", status], ["t.category", category], ["u.role", role], ["t.priority", priority]]) if (value) { where.push(`${column} = ?`); values.push(value); }
  if (params.get("unanswered") === "1") where.push(needsReply);
  if (assignment === "unassigned") where.push("t.assigned_github_id IS NULL");
  else if (assignment) { where.push("t.assigned_github_id = ?"); values.push(assignment === "mine" ? session.githubId : Number(assignment)); }
  if (query) { where.push("instr(t.search_text, ?) > 0"); values.push(normalizeSupportSearch(query)); }
  if (cursor) { where.push("(t.created_at < ? OR (t.created_at = ? AND t.id < ?))"); values.push(cursor.createdAt, cursor.createdAt, cursor.id); }
  const [rows, administrators, summary, alerts, alertCount] = await Promise.all([
    env.DB.prepare(`SELECT ${columns} ${joins} WHERE ${where.join(" AND ")} ORDER BY t.created_at DESC, t.id DESC LIMIT ?`).bind(...values, limit + 1).all<{ id: string; created_at: string }>(),
    env.DB.prepare("SELECT github_id, github_login FROM github_administrators WHERE status = 'active' ORDER BY github_login").all(),
    env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(t.status = 'open'),0) AS open, COALESCE(SUM(t.status = 'waiting_user'),0) AS waiting_user, COALESCE(SUM(${needsReply}),0) AS unanswered, COALESCE(SUM(t.assigned_github_id IS NULL AND t.status IN ('open','waiting_user')),0) AS unassigned, AVG(CASE WHEN first_response_at IS NOT NULL THEN (julianday(first_response_at) - julianday(t.created_at)) * 86400 END) AS average_first_response_seconds, AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(t.created_at)) * 86400 END) AS average_resolution_seconds FROM support_tickets t`).first(),
    env.DB.prepare("SELECT e.id, e.ticket_id, e.kind, e.created_at FROM support_team_alerts e WHERE NOT EXISTS (SELECT 1 FROM support_alert_receipts r WHERE r.alert_id = e.id AND r.github_id = ?) ORDER BY e.id DESC LIMIT 20").bind(session.githubId).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM support_team_alerts e WHERE NOT EXISTS (SELECT 1 FROM support_alert_receipts r WHERE r.alert_id = e.id AND r.github_id = ?)").bind(session.githubId).first<{ n: number }>(),
  ]);
  return supportJson({ tickets: rows.results.slice(0, limit), nextCursor: nextListCursor(rows.results, limit), administrators: administrators.results, summary, alerts: alerts.results, unreadAlerts: alertCount?.n || 0 });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  const session = await readSession(request, env);
  if (!session?.githubId) return supportJson({ error: "No autorizado." }, 401);
  if (!env.DB) return supportJson({ error: "Base de datos no disponible." }, 503);
  const body = await readJsonBody(request, 20_480);
  if (body?.action === "acknowledge_alerts") {
    const through = Number(body.throughId);
    if (!Number.isSafeInteger(through) || through < 1) return supportJson({ error: "Indica el último aviso mostrado." }, 400);
    await env.DB.prepare("INSERT OR IGNORE INTO support_alert_receipts (github_id, alert_id) SELECT ?, id FROM support_team_alerts WHERE id <= ?").bind(session.githubId, through).run();
    return supportJson({ saved: true });
  }
  const ticketId = supportText(body?.ticketId, 1, 80), key = requestKey(body?.requestId), version = versionNumber(body?.expectedVersion);
  const message = body?.message == null || body.message === "" ? "" : supportText(body.message, 10, 4000);
  const visibility = body?.visibility === undefined ? "public" : body.visibility;
  if (!ticketId || !key || version === null || message === null || !["public", "internal"].includes(String(visibility)) || (body?.status !== undefined && !supportStatuses.has(String(body.status))) || (body?.priority !== undefined && !supportPriorities.has(String(body.priority))) || (body?.assignedGithubId !== undefined && body.assignedGithubId !== null && (!Number.isSafeInteger(body.assignedGithubId) || Number(body.assignedGithubId) < 1))) return supportJson({ error: "Revisa estado, prioridad, administrador, respuesta (10–4000 caracteres) y versión del ticket." }, 400);
  const actorKey = `admin:${session.githubId}`, hash = await supportHash({ ticketId, version, message, visibility, status: body?.status ?? null, priority: body?.priority ?? null, assignee: body?.assignedGithubId === undefined ? "unchanged" : body.assignedGithubId });
  const prior = await mutationReplay(env.DB, actorKey, key, hash); if (prior) return prior;
  const ticket = await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(ticketId).first<SupportTicket>();
  if (!ticket) return supportJson({ error: "Ticket no encontrado." }, 404);
  const status = body?.status ?? ticket.status, priority = body?.priority ?? ticket.priority, assignee = body?.assignedGithubId === undefined ? ticket.assigned_github_id : body.assignedGithubId;
  if (assignee !== null) {
    const active = await env.DB.prepare("SELECT github_id FROM github_administrators WHERE github_id = ? AND status = 'active'").bind(assignee).first();
    if (!active) return supportJson({ error: "Solo puedes asignar un administrador activo." }, 400);
  }
  if (!message && status === ticket.status && priority === ticket.priority && assignee === ticket.assigned_github_id) return supportJson({ error: "No hay cambios para guardar." }, 400);
  try {
    await env.DB.prepare("INSERT INTO support_mutations (id, ticket_id, actor_key, actor_kind, actor_id, actor_login, request_key, payload_hash, expected_version, action, target_status, target_priority, target_assignee, body, visibility) VALUES (?, ?, ?, 'admin', ?, ?, ?, ?, ?, 'update', ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), ticketId, actorKey, String(session.githubId), session.login, key, hash, version, status, priority, assignee, message, visibility).run();
  } catch (error) { const retry = await mutationReplay(env.DB, actorKey, key, hash); return retry || supportWriteError(error); }
  return supportJson({ saved: true, ticketId, version: version + 1 });
};
