import type { D1Database, UserSession } from "./user-auth";

export const supportCategories = new Set(["account", "case", "technical", "privacy", "other"]);
export const supportStatuses = new Set(["open", "waiting_user", "resolved", "closed"]);
export const supportPriorities = new Set(["low", "normal", "high", "urgent"]);
export const supportHeaders = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
export function supportJson(data: unknown, status = 200) { return Response.json(data, { status, headers: supportHeaders }); }
export function normalizeSupportSearch(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es"); }
export function supportText(value: unknown, min: number, max: number) { return typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null; }
export function requestKey(value: unknown) { return typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value) ? value : null; }
export function versionNumber(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null; }
export async function supportHash(value: unknown) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
export function pageLimit(params: URLSearchParams) { const value = Number(params.get("limit") || 20); return Number.isInteger(value) && value >= 1 && value <= 50 ? value : 20; }
export function listCursor(value: string | null): { createdAt: string; id: string } | null {
  if (!value || value.length > 512) return null;
  try { const data: unknown = JSON.parse(atob(value)); if (data && typeof data === "object" && "createdAt" in data && "id" in data && typeof data.createdAt === "string" && typeof data.id === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.createdAt) && data.id.length <= 80) return { createdAt: data.createdAt, id: data.id }; } catch { /* Invalid cursors are rejected by callers. */ }
  return null;
}
export function nextListCursor(rows: Array<{ created_at: string; id: string }>, limit: number) { const last = rows[limit - 1]; return rows.length > limit && last ? btoa(JSON.stringify({ createdAt: last.created_at, id: last.id })) : null; }
export function casePermission(session: UserSession, alias = "c") {
  return session.role === "person" ? { sql: `${alias}.person_id = ?`, values: [session.id] } : session.role === "lawyer" ? {
    sql: `${alias}.person_id != ? AND EXISTS (SELECT 1 FROM case_proposals p JOIN lawyer_profiles lp ON lp.user_id = p.lawyer_id JOIN users lu ON lu.id = p.lawyer_id WHERE p.case_id = ${alias}.id AND p.lawyer_id = ? AND p.status = 'accepted' AND lp.application_status = 'approved' AND lu.status = 'active')`, values: [session.id, session.id],
  } : { sql: "0 = 1", values: [] };
}
export async function supportCases(db: D1Database, session: UserSession, params: URLSearchParams) {
  const cursorText = params.get("casesCursor"), cursor = listCursor(cursorText);
  if (cursorText && !cursor) return null;
  const permission = casePermission(session), limit = 50;
  const values: unknown[] = [...permission.values];
  let sql = `SELECT c.id, c.title, c.created_at FROM legal_cases c WHERE ${permission.sql}`;
  if (cursor) { sql += " AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))"; values.push(cursor.createdAt, cursor.createdAt, cursor.id); }
  const rows = (await db.prepare(`${sql} ORDER BY c.created_at DESC, c.id DESC LIMIT ?`).bind(...values, limit + 1).all<{ id: string; title: string; created_at: string }>()).results;
  return { cases: rows.slice(0, limit), nextCasesCursor: nextListCursor(rows, limit) };
}
export type SupportTicket = { id: string; user_id: string; subject: string; category: string; status: string; case_id: string | null; priority: string; assigned_github_id: number | null; version: number; created_at: string; updated_at: string; first_response_at: string | null; last_user_message_at: string | null; last_public_reply_at: string | null; resolved_at: string | null; closed_at: string | null };
export async function supportThread(db: D1Database, ticketId: string, params: URLSearchParams, admin: boolean) {
  const before = params.get("before");
  if (before && (!/^\d{1,16}$/.test(before) || !Number.isSafeInteger(Number(before)) || Number(before) < 1)) return null;
  const values: unknown[] = [ticketId];
  let sql = `SELECT rowid AS sequence, id, ticket_id, author, body, created_at${admin ? ", visibility, admin_login" : ""} FROM support_ticket_messages WHERE ticket_id = ?${admin ? "" : " AND visibility = 'public'"}`;
  if (before) { sql += " AND rowid < ?"; values.push(Number(before)); }
  const limit = pageLimit(params);
  const rows = (await db.prepare(`${sql} ORDER BY rowid DESC LIMIT ?`).bind(...values, limit + 1).all<{ sequence: number; id: string; ticket_id: string; author: string; body: string; created_at: string; visibility?: string; admin_login?: string | null }>()).results;
  const messages = rows.slice(0, limit).reverse();
  return { messages, nextMessagesCursor: rows.length > limit ? String(messages[0]?.sequence) : null };
}
export async function mutationReplay(db: D1Database, actorKey: string, key: string, hash: string) {
  const prior = await db.prepare("SELECT ticket_id, payload_hash, expected_version FROM support_mutations WHERE actor_key = ? AND request_key = ?").bind(actorKey, key).first<{ ticket_id: string; payload_hash: string; expected_version: number }>();
  return prior ? prior.payload_hash === hash ? supportJson({ saved: true, ticketId: prior.ticket_id, version: prior.expected_version + 1, replayed: true }) : supportJson({ error: "La clave de reintento ya corresponde a otra operación." }, 409) : null;
}
export function supportWriteError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("support_daily_limit")) return supportJson({ error: "Alcanzaste el límite de cinco tickets nuevos en las últimas 24 horas." }, 429);
  if (message.includes("support_reply_limit")) return supportJson({ error: "Alcanzaste el límite de acciones por hora. Espera antes de volver a intentarlo." }, 429);
  if (message.includes("support_case_permission")) return supportJson({ error: "El caso vinculado ya no está disponible para tu cuenta. Actualiza el selector." }, 403);
  if (message.includes("support_version_conflict")) return supportJson({ error: "El ticket cambió en otra sesión. Actualiza la conversación antes de guardar." }, 409);
  if (message.includes("support_permission") || message.includes("support_invalid_assignee")) return supportJson({ error: "El ticket o el administrador asignado ya no está disponible. Actualiza la bandeja." }, 409);
  throw error;
}
