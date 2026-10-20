import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { createSession } from "../functions/_lib/github-auth";
import { createUserSession, type UserRole } from "../functions/_lib/user-auth";
import { onRequestGet as userGet, onRequestPost as createTicket, onRequestPatch as userPatch } from "../functions/api/tickets";
import { onRequestGet as adminGet, onRequestPatch as adminPatch } from "../functions/api/admin/tickets";
import worker from "../src/worker";

// Every account/message below is synthetic and lives in memory. Never contacts production.
const clientId = "person-cliente-prueba", lawyerId = "lawyer-maria-recabarren";
function environment() { return { DB: new TestDb(), USER_AUTH_SECRET: "support-test-user-secret", AUTH_SESSION_SECRET: "support-test-admin-secret" }; }
function request(path: string, body?: unknown, cookie = "", method = "PATCH", origin = "https://jurisconecta.cl") { return new Request(`https://jurisconecta.cl${path}`, { method: body === undefined ? "GET" : method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function adminCookie(env: ReturnType<typeof environment>, login = "gprecabarren") { return `juris_admin=${await createSession(login, env, request("/admin"))}`; }
async function userCookie(env: ReturnType<typeof environment>, id = clientId) {
  const user = await env.DB.prepare("SELECT id, email, full_name, role, session_version FROM users WHERE id = ?").bind(id).first<{ id: string; email: string; full_name: string; role: UserRole; session_version: number }>(); assert.ok(user);
  return `juris_user=${await createUserSession({ id, email: user.email, fullName: user.full_name, role: user.role, sessionVersion: user.session_version }, env, request("/soporte"))}`;
}
function createBody(overrides: Record<string, unknown> = {}) { return { subject: "Problema ficticio de soporte", category: "technical", message: "Descripción ficticia suficientemente extensa para probar la creación segura de tickets.", requestId: crypto.randomUUID(), ...overrides }; }
async function ticket(env: ReturnType<typeof environment>, cookie: string, overrides: Record<string, unknown> = {}) { const response = await createTicket({ request: request("/api/tickets", createBody(overrides), cookie, "POST"), env }); assert.equal(response.status, 201); return (await response.json() as { id: string }).id; }
async function change(env: ReturnType<typeof environment>, cookie: string, id: string, version: number, overrides: Record<string, unknown> = {}) { return adminPatch({ request: request("/api/admin/tickets", { ticketId: id, expectedVersion: version, requestId: crypto.randomUUID(), ...overrides }, cookie), env }); }
async function reply(env: ReturnType<typeof environment>, cookie: string, id: string, version: number, overrides: Record<string, unknown> = {}) { return userPatch({ request: request("/api/tickets", { ticketId: id, expectedVersion: version, requestId: crypto.randomUUID(), message: "Respuesta ficticia del usuario para continuar la conversación.", ...overrides }, cookie), env }); }
async function count(env: ReturnType<typeof environment>, table: string) { return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n || 0; }

test("support APIs authenticate both roles and Worker rejects cross-origin writes", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env);
  assert.equal((await userGet({ request: request("/api/tickets"), env })).status, 401);
  assert.equal((await adminGet({ request: request("/api/admin/tickets", undefined, user), env })).status, 401);
  assert.equal((await userGet({ request: request("/api/tickets", undefined, admin), env })).status, 401);
  const workerEnv = { ...env, ASSETS: { fetch: async () => new Response("fixture") } } as unknown as Parameters<typeof worker.fetch>[1];
  assert.equal((await worker.fetch(request("/api/tickets", createBody(), user, "POST", "https://evil.example"), workerEnv)).status, 403);
  assert.equal((await worker.fetch(request("/api/admin/tickets", { ticketId: "ficticio" }, admin, "PATCH", "https://evil.example"), workerEnv)).status, 403);
  assert.equal(await count(env, "support_tickets"), 0);
});

test("creation is validated, idempotent and creates exactly one persistent team alert", async () => {
  const env = environment(), cookie = await userCookie(env), admin = await adminCookie(env), body = createBody();
  assert.equal((await createTicket({ request: request("/api/tickets", { ...body, message: "corto" }, cookie, "POST"), env })).status, 400);
  assert.equal((await createTicket({ request: request("/api/tickets", { ...body, message: "x".repeat(4001) }, cookie, "POST"), env })).status, 400);
  const first = await createTicket({ request: request("/api/tickets", body, cookie, "POST"), env }); assert.equal(first.status, 201);
  const id = (await first.json() as { id: string }).id;
  const second = await createTicket({ request: request("/api/tickets", body, cookie, "POST"), env }); assert.equal(second.status, 200); assert.equal((await second.json() as { id: string }).id, id);
  assert.equal((await createTicket({ request: request("/api/tickets", { ...body, subject: "Otro asunto distinto" }, cookie, "POST"), env })).status, 409);
  assert.equal(await count(env, "support_tickets"), 1); assert.equal(await count(env, "support_ticket_messages"), 1); assert.equal(await count(env, "support_team_alerts"), 1);
  const alerts = await adminGet({ request: request("/api/admin/tickets?alertsOnly=1", undefined, admin), env }); assert.deepEqual(await alerts.json(), { unreadAlerts: 1 });
  assert.equal(alerts.headers.get("Cache-Control"), "no-store"); assert.equal(alerts.headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("ticket daily quota is atomic under concurrent creation; retry at quota stays successful", async () => {
  const env = environment(), cookie = await userCookie(env), bodies = Array.from({ length: 7 }, () => createBody());
  const responses = await Promise.all(bodies.map((body) => createTicket({ request: request("/api/tickets", body, cookie, "POST"), env })));
  assert.equal(responses.filter((response) => response.status === 201).length, 5); assert.equal(responses.filter((response) => response.status === 429).length, 2);
  assert.equal(await count(env, "support_tickets"), 5); assert.equal(await count(env, "support_team_alerts"), 5);
  const successful = responses.findIndex((response) => response.status === 201);
  assert.equal((await createTicket({ request: request("/api/tickets", bodies[successful], cookie, "POST"), env })).status, 200);
});

test("users cannot access/reply to another account; public serialization never exposes internal notes or GitHub identity", async () => {
  const env = environment(), user = await userCookie(env), other = await userCookie(env, lawyerId), admin = await adminCookie(env), id = await ticket(env, user);
  assert.equal((await userGet({ request: request(`/api/tickets?ticketId=${id}`, undefined, other), env })).status, 404);
  assert.equal((await reply(env, other, id, 0)).status, 404);
  assert.equal((await change(env, admin, id, 0, { visibility: "internal", message: "Nota ficticia reservada para revisión interna del administrador." })).status, 200);
  const userData = await (await userGet({ request: request(`/api/tickets?ticketId=${id}`, undefined, user), env })).json() as { messages: unknown[]; ticket: Record<string, unknown> };
  assert.equal(userData.messages.length, 1); const serialized = JSON.stringify(userData); assert.equal(serialized.includes("reservada"), false); assert.equal(serialized.includes("gprecabarren"), false); assert.equal(serialized.includes("admin_login"), false); assert.equal("assigned_github_id" in userData.ticket, false);
  const adminData = await (await adminGet({ request: request(`/api/admin/tickets?ticketId=${id}`, undefined, admin), env })).json() as { messages: Array<{ visibility: string; admin_login: string | null }> };
  assert.equal(adminData.messages[1].visibility, "internal"); assert.equal(adminData.messages[1].admin_login, "gprecabarren");
  assert.equal(await count(env, "notifications"), 0);
  assert.equal((await env.DB.prepare("SELECT first_response_at FROM support_tickets WHERE id = ?").bind(id).first<{ first_response_at: string | null }>())?.first_response_at, null);
});

test("public replies update first response, identity, user notice and need-response metrics atomically", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env), id = await ticket(env, user);
  assert.equal((await change(env, admin, id, 0, { status: "waiting_user", priority: "high", assignedGithubId: 58262409, message: "Respuesta ficticia pública del equipo de JurisConecta." })).status, 200);
  const current = await env.DB.prepare("SELECT version, status, first_response_at, assigned_github_id FROM support_tickets WHERE id = ?").bind(id).first<{ version: number; status: string; first_response_at: string | null; assigned_github_id: number }>(); assert.equal(current?.version, 1); assert.equal(current?.status, "waiting_user"); assert.ok(current?.first_response_at); assert.equal(current?.assigned_github_id, 58262409);
  assert.equal(await count(env, "notifications"), 1); assert.equal(await count(env, "admin_audit_log"), 1);
  let list = await (await adminGet({ request: request("/api/admin/tickets?unanswered=1", undefined, admin), env })).json() as { tickets: unknown[] }; assert.equal(list.tickets.length, 0);
  assert.equal((await reply(env, user, id, 1)).status, 200);
  list = await (await adminGet({ request: request("/api/admin/tickets?unanswered=1", undefined, admin), env })).json() as { tickets: unknown[] }; assert.equal(list.tickets.length, 1);
  assert.equal(await count(env, "support_team_alerts"), 2);
});

test("close and explicit reopen preserve history; stale concurrent writes and idempotent replay never duplicate messages", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env), id = await ticket(env, user);
  assert.equal((await change(env, admin, id, 0, { status: "closed" })).status, 200);
  assert.equal((await reply(env, user, id, 1)).status, 409);
  assert.equal((await reply(env, user, id, 1, { action: "reopen" })).status, 200);
  const current = await env.DB.prepare("SELECT status, closed_at, resolved_at FROM support_tickets WHERE id = ?").bind(id).first<{ status: string; closed_at: string | null; resolved_at: string | null }>(); assert.deepEqual({ ...current }, { status: "open", closed_at: null, resolved_at: null });
  const key = crypto.randomUUID(), body = { ticketId: id, expectedVersion: 2, requestId: key, status: "waiting_user", message: "Respuesta pública para probar reintentos sin duplicados." };
  const writes = await Promise.all([adminPatch({ request: request("/api/admin/tickets", body, admin), env }), change(env, admin, id, 2, { priority: "urgent" })]); assert.equal(writes.filter((response) => response.status === 200).length, 1); assert.equal(writes.filter((response) => response.status === 409).length, 1);
  const accepted = writes[0].status === 200;
  if (accepted) {
    const replay = await adminPatch({ request: request("/api/admin/tickets", body, admin), env }); assert.equal(replay.status, 200); assert.equal((await replay.json() as { replayed: boolean }).replayed, true);
    assert.equal((await adminPatch({ request: request("/api/admin/tickets", { ...body, message: "Otro mensaje que no debe reutilizar una clave de envío." }, admin), env })).status, 409);
  }
  assert.equal((await env.DB.prepare("SELECT version FROM support_tickets WHERE id = ?").bind(id).first<{ version: number }>())?.version, 3);
});

test("only active GitHub administrators can be assigned; revoking an assigned admin does not block the user", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env), id = await ticket(env, user);
  await env.DB.prepare("INSERT INTO github_administrators (github_id, github_login, role) VALUES (999001, 'soporte-ficticio', 'admin')").run();
  assert.equal((await change(env, admin, id, 0, { assignedGithubId: 123456 })).status, 400);
  assert.equal((await change(env, admin, id, 0, { assignedGithubId: 999001 })).status, 200);
  await env.DB.prepare("UPDATE github_administrators SET status = 'revoked' WHERE github_id = 999001").run();
  assert.equal((await reply(env, user, id, 1)).status, 200);
  assert.equal((await change(env, admin, id, 2, { assignedGithubId: 999001, priority: "high" })).status, 400);
  assert.equal((await change(env, admin, id, 2, { assignedGithubId: null })).status, 200);
});

test("team alerts are per administrator, acknowledgment is bounded and badge leaks no personal data", async () => {
  const env = environment(), user = await userCookie(env), owner = await adminCookie(env);
  await env.DB.prepare("INSERT INTO github_administrators (github_id, github_login, role) VALUES (999002, 'otro-ficticio', 'admin')").run();
  const otherAdmin = await adminCookie(env, "otro-ficticio"), id = await ticket(env, user);
  assert.equal((await adminPatch({ request: request("/api/admin/tickets", { action: "acknowledge_alerts", throughId: 1 }, owner), env })).status, 200);
  assert.deepEqual(await (await adminGet({ request: request("/api/admin/tickets?alertsOnly=1", undefined, owner), env })).json(), { unreadAlerts: 0 });
  assert.deepEqual(await (await adminGet({ request: request("/api/admin/tickets?alertsOnly=1", undefined, otherAdmin), env })).json(), { unreadAlerts: 1 });
  assert.equal((await reply(env, user, id, 0)).status, 200);
  assert.deepEqual(await (await adminGet({ request: request("/api/admin/tickets?alertsOnly=1", undefined, owner), env })).json(), { unreadAlerts: 1 });
});

test("ticket lists are keyset paginated, searchable and filter by category/status/role/priority/assignment", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env);
  const ids = [await ticket(env, user, { subject: "Fallo distintivo del portal", category: "account" }), await ticket(env, user), await ticket(env, user)];
  assert.equal((await change(env, admin, ids[0], 0, { status: "waiting_user", assignedGithubId: 58262409, priority: "urgent", message: "Respuesta de prueba para continuar con una validación." })).status, 200);
  const first = await (await adminGet({ request: request("/api/admin/tickets?limit=2", undefined, admin), env })).json() as { tickets: Array<{ id: string }>; nextCursor: string };
  const second = await (await adminGet({ request: request(`/api/admin/tickets?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`, undefined, admin), env })).json() as { tickets: Array<{ id: string }>; nextCursor: null };
  assert.equal(new Set([...first.tickets, ...second.tickets].map((item) => item.id)).size, 3); assert.equal(second.nextCursor, null);
  const filtered = await (await adminGet({ request: request("/api/admin/tickets?q=distintivo&category=account&status=waiting_user&role=person&priority=urgent&assignment=mine", undefined, admin), env })).json() as { tickets: Array<{ id: string }> }; assert.deepEqual(filtered.tickets.map((item) => item.id), [ids[0]]);
  const malformed = await adminGet({ request: request("/api/admin/tickets?cursor=bad", undefined, admin), env }); assert.equal(malformed.status, 400);
  assert.equal((await userGet({ request: request("/api/tickets?cursor=bad", undefined, user), env })).status, 400);
});

test("latest messages and load-older retain complete history beyond former global limits, excluding private notes in every user page", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env), id = await ticket(env, user), secondId = await ticket(env, user);
  for (let i = 0; i < 1050; i++) await env.DB.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author, body, visibility, admin_login) VALUES (?, ?, 'admin', ?, ?, 'gprecabarren')").bind(`ficticio-${i}`, i % 2 ? id : secondId, `Mensaje ficticio ${i}`, i % 7 === 0 ? "internal" : "public").run();
  let before = "", total = 0; const unique = new Set<string>();
  do {
    const response = await userGet({ request: request(`/api/tickets?ticketId=${id}&limit=50${before ? `&before=${before}` : ""}`, undefined, user), env }); assert.equal(response.status, 200);
    const data = await response.json() as { messages: Array<{ id: string; admin_login?: string; body: string }>; nextMessagesCursor: string | null };
    assert.ok(data.messages.length <= 50); for (const message of data.messages) { assert.equal(message.admin_login, undefined); unique.add(message.id); } total += data.messages.length; before = data.nextMessagesCursor || "";
  } while (before);
  const expected = (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_ticket_messages WHERE ticket_id = ? AND visibility = 'public'").bind(id).first<{ n: number }>())?.n; assert.equal(total, expected); assert.equal(unique.size, expected);
  const latest = await (await adminGet({ request: request(`/api/admin/tickets?ticketId=${id}`, undefined, admin), env })).json() as { messages: Array<{ id: string }>; nextMessagesCursor: string | null }; assert.equal(latest.messages.length, 20); assert.equal(latest.messages.at(-1)?.id, "ficticio-1049"); assert.ok(latest.nextMessagesCursor);
});

test("case selector permits only owned client cases or accepted active lawyer assignments, never arbitrary pool cases", async () => {
  const env = environment(), user = await userCookie(env), lawyer = await userCookie(env, lawyerId);
  await env.DB.prepare("UPDATE lawyer_profiles SET application_status = 'approved' WHERE user_id = ?").bind(lawyerId).run();
  await env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(lawyerId).run();
  for (const id of ["ficticio-aceptado", "ficticio-pool"]) await env.DB.prepare("INSERT INTO legal_cases (id, person_id, category, title, description) VALUES (?, ?, 'Derecho Civil', 'Caso ficticio de test', 'Descripción ficticia.')").bind(id, clientId).run();
  await env.DB.prepare("INSERT INTO case_proposals (id, case_id, lawyer_id, message, status) VALUES ('propuesta-ficticia', 'ficticio-aceptado', ?, 'Propuesta ficticia', 'accepted')").bind(lawyerId).run();
  const lawData = await (await userGet({ request: request("/api/tickets", undefined, lawyer), env })).json() as { cases: Array<{ id: string }> }; assert.equal(lawData.cases.some((item) => item.id === "ficticio-aceptado"), true); assert.equal(lawData.cases.some((item) => item.id === "ficticio-pool"), false);
  assert.equal((await createTicket({ request: request("/api/tickets", createBody({ caseId: "ficticio-pool" }), lawyer, "POST"), env })).status, 403);
  assert.equal((await createTicket({ request: request("/api/tickets", createBody({ caseId: "ficticio-aceptado" }), lawyer, "POST"), env })).status, 201);
  assert.equal((await createTicket({ request: request("/api/tickets", createBody({ caseId: "ficticio-pool" }), user, "POST"), env })).status, 201);
  await env.DB.prepare("UPDATE case_proposals SET status = 'withdrawn' WHERE id = 'propuesta-ficticia'").run();
  assert.equal((await createTicket({ request: request("/api/tickets", createBody({ caseId: "ficticio-aceptado" }), lawyer, "POST"), env })).status, 403);
});

test("reply rate limit and notice preferences preserve state, audit and retries", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env), id = await ticket(env, user);
  await env.DB.prepare("INSERT INTO notification_preferences (user_id, support_updates) VALUES (?, 0)").bind(clientId).run();
  assert.equal((await change(env, admin, id, 0, { message: "Respuesta ficticia sin aviso por preferencia del usuario." })).status, 200); assert.equal(await count(env, "notifications"), 0);
  for (let version = 1; version <= 30; version++) assert.equal((await reply(env, user, id, version)).status, 200);
  const totalMessages = await count(env, "support_ticket_messages"), alerts = await count(env, "support_team_alerts");
  assert.equal((await reply(env, user, id, 31)).status, 429); assert.equal(await count(env, "support_ticket_messages"), totalMessages); assert.equal(await count(env, "support_team_alerts"), alerts);
  assert.equal((await env.DB.prepare("SELECT version FROM support_tickets WHERE id = ?").bind(id).first<{ version: number }>())?.version, 31);
});

test("failure in an audit write rolls back status, response, notice and immutable mutation together", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env), id = await ticket(env, user);
  env.DB.native.exec("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON admin_audit_log BEGIN SELECT RAISE(ABORT, 'synthetic_audit_failure'); END");
  await assert.rejects(change(env, admin, id, 0, { status: "resolved", message: "Respuesta pública ficticia que debe revertirse íntegramente." }), /synthetic_audit_failure/);
  const saved = await env.DB.prepare("SELECT status, version, first_response_at, resolved_at FROM support_tickets WHERE id = ?").bind(id).first();
  assert.deepEqual({ ...saved }, { status: "open", version: 0, first_response_at: null, resolved_at: null });
  assert.equal(await count(env, "support_ticket_messages"), 1); assert.equal(await count(env, "support_mutations"), 0); assert.equal(await count(env, "notifications"), 0); assert.equal(await count(env, "support_team_alerts"), 1);
});

test("identical concurrent retries create one response, one notice and one audit even with a stale expected version", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env), id = await ticket(env, user);
  const body = { ticketId: id, expectedVersion: 0, requestId: crypto.randomUUID(), status: "waiting_user", message: "Respuesta ficticia concurrente que se debe guardar solo una vez." };
  const responses = await Promise.all(Array.from({ length: 3 }, () => adminPatch({ request: request("/api/admin/tickets", body, admin), env })));
  assert.equal(responses.every((response) => response.status === 200), true); assert.equal(await count(env, "support_ticket_messages"), 2); assert.equal(await count(env, "support_mutations"), 1); assert.equal(await count(env, "notifications"), 1); assert.equal(await count(env, "admin_audit_log"), 1);
});

test("Spanish ticket search folds uppercase, accents and ñ and follows profile/subject edits without changing display text", async () => {
  const env = environment(), user = await userCookie(env), admin = await adminCookie(env);
  const id = await ticket(env, user, { subject: "Consulta de Pensión para un NIÑO" });
  for (const query of ["PENSIÓN", "pensión", "pension", "NIÑO", "nino", "PENSIO\u0301N"]) {
    const result = await (await adminGet({ request: request(`/api/admin/tickets?q=${encodeURIComponent(query)}`, undefined, admin), env })).json() as { tickets: Array<{ id: string; subject: string }> };
    assert.equal(result.tickets.some((item) => item.id === id), true, query); assert.equal(result.tickets[0]?.subject, "Consulta de Pensión para un NIÑO");
  }
  await env.DB.prepare("UPDATE users SET full_name = 'Muñoz Óscar' WHERE id = ?").bind(clientId).run();
  const renamed = await (await adminGet({ request: request("/api/admin/tickets?q=MUNOZ%20OSCAR", undefined, admin), env })).json() as { tickets: Array<{ id: string }> }; assert.equal(renamed.tickets[0]?.id, id);
  await env.DB.prepare("UPDATE support_tickets SET subject = 'LICENCIA MÉDICA' WHERE id = ?").bind(id).run();
  const revised = await (await adminGet({ request: request("/api/admin/tickets?q=licencia%20medica", undefined, admin), env })).json() as { tickets: Array<{ id: string }> }; assert.equal(revised.tickets[0]?.id, id);
});
