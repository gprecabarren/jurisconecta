import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { createSession } from "../functions/_lib/github-auth";
import { createUserSession, readUserSession, type UserRole } from "../functions/_lib/user-auth";
import { onRequestGet, onRequestPatch } from "../functions/api/admin/users";
import { onRequestGet as clientCases } from "../functions/api/cases";
import { onRequestGet as lawyerCases } from "../functions/api/lawyer/cases";
import { onRequestGet as lawyerProposals, onRequestPost as sendProposal } from "../functions/api/lawyer/proposals";
import { onRequestPatch as reviewApplication } from "../functions/api/admin/applications";
import { onRequestPatch as decideProposal } from "../functions/api/client/proposals";

function environment() { return { DB: new TestDb(), USER_AUTH_SECRET: "roles-isolated-user-secret", AUTH_SESSION_SECRET: "roles-isolated-admin-secret" }; }
function request(body?: unknown, cookie = "", query = "") {
  return new Request(`https://jurisconecta.cl/api/admin/users${query}`, { method: body === undefined ? "GET" : "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://jurisconecta.cl" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function administrator(env: ReturnType<typeof environment>) { return `juris_admin=${await createSession("gprecabarren", env, request())}`; }
async function accountCookie(env: ReturnType<typeof environment>, id: string) {
  const row = await env.DB.prepare("SELECT id, email, full_name, role, session_version FROM users WHERE id = ?").bind(id).first<{ id: string; email: string; full_name: string; role: UserRole; session_version: number }>();
  assert.ok(row);
  return `juris_user=${await createUserSession({ id, email: row.email, fullName: row.full_name, role: row.role, sessionVersion: row.session_version }, env, request())}`;
}
const clientId = "person-cliente-prueba", lawyerId = "lawyer-maria-recabarren";
const change = (id = clientId, overrides: Record<string, unknown> = {}) => ({ action: "change_role", id, role: "lawyer", expectedRole: "person", expectedVersion: 0, confirmEmail: "cliente.prueba@jurisconecta.cl", confirmConsequences: true, ...overrides });

test("one normalized email has only one account and one scalar role", async () => {
  const env = environment();
  await assert.rejects(env.DB.prepare("INSERT INTO users (id, email, full_name, role) VALUES ('duplicate', ' CLIENTE.PRUEBA@JURISCONECTA.CL ', 'Ficticio', 'lawyer')").run(), /email_already_registered/);
  await assert.rejects(env.DB.prepare("UPDATE users SET email = 'CLIENTE.PRUEBA@JURISCONECTA.CL' WHERE id = ?").bind(lawyerId).run(), /email_already_registered/);
  await assert.rejects(env.DB.prepare("UPDATE users SET role = 'person,lawyer' WHERE id = ?").bind(clientId).run(), /CHECK/);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE lower(trim(email)) = 'cliente.prueba@jurisconecta.cl'").first<{ n: number }>())?.n, 1);
});

test("client to lawyer revokes every device, retains client cases and creates only an unapproved empty wallet", async () => {
  const env = environment(), admin = await administrator(env), oldSession = await accountCookie(env, clientId);
  await accountCookie(env, clientId);
  await env.DB.prepare("INSERT INTO legal_cases (id, person_id, category, title, description) VALUES ('old-client-case', ?, 'Derecho Familiar', 'Caso ficticio conservado', 'Datos completamente ficticios.')").bind(clientId).run();
  assert.equal((await clientCases({ request: request(undefined, oldSession), env })).status, 200);
  const response = await onRequestPatch({ request: request(change(), admin), env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: true, role: "lawyer", status: "pending", sessionVersion: 1, sessionsRevoked: true });
  assert.equal(await readUserSession(request(undefined, oldSession), env), null);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL").bind(clientId).first<{ n: number }>())?.n, 0);
  const profile = await env.DB.prepare("SELECT application_status, credit_balance, subscription_status FROM lawyer_profiles WHERE user_id = ?").bind(clientId).first();
  assert.deepEqual({ ...profile }, { application_status: "draft", credit_balance: 0, subscription_status: "none" });
  const newSession = await accountCookie(env, clientId);
  assert.equal((await clientCases({ request: request(undefined, newSession), env })).status, 401);
  const unavailable = await lawyerCases({ request: request(undefined, newSession), env });
  assert.equal(unavailable.status, 200);
  assert.deepEqual(await unavailable.json(), { cases: [], creditBalance: 0, verified: false });
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM legal_cases WHERE id = 'old-client-case'").first<{ n: number }>())?.n, 1);
  const detail = await onRequestGet({ request: request(undefined, admin, `?id=${clientId}`), env });
  const data = await detail.json() as { user: { role: string; session_version: number }; cases: unknown[] };
  assert.equal(data.user.role, "lawyer"); assert.equal(data.user.session_version, 1); assert.equal(data.cases.length, 1);
  // Even a later valid approval must not turn an inherited client case into a
  // self-proposal or reveal it through the professional marketplace.
  await env.DB.prepare("UPDATE lawyer_profiles SET application_status = 'approved' WHERE user_id = ?").bind(clientId).run();
  await env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(clientId).run();
  const pool = await lawyerCases({ request: request(undefined, newSession), env });
  assert.equal(pool.status, 200);
  assert.equal((await pool.json() as { cases: Array<{ id: string }> }).cases.some((item) => item.id === "old-client-case"), false);
  assert.equal((await sendProposal({ request: request({ caseId: "old-client-case", message: "Texto ficticio suficientemente largo para probar la prohibición." }, newSession), env })).status, 403);
});

test("lawyer to client removes professional access without deleting proposals, approvals or credits; restoring respects approval", async () => {
  const env = environment(), admin = await administrator(env), oldSession = await accountCookie(env, lawyerId);
  await env.DB.prepare("INSERT INTO legal_cases (id, person_id, category, title, description) VALUES ('proposal-case', ?, 'Derecho Penal', 'Caso ficticio', 'Datos ficticios.')").bind(clientId).run();
  await env.DB.prepare("INSERT INTO case_proposals (id, case_id, lawyer_id, message) VALUES ('old-proposal', 'proposal-case', ?, 'Propuesta ficticia que se debe conservar.')").bind(lawyerId).run();
  const before = await env.DB.prepare("SELECT credit_balance, plan_credit_balance, reserve_credit_balance, application_status FROM lawyer_profiles WHERE user_id = ?").bind(lawyerId).first();
  assert.equal((await lawyerProposals({ request: request(undefined, oldSession), env })).status, 200);
  const body = change(lawyerId, { role: "person", expectedRole: "lawyer", confirmEmail: "mrecabarrend@gmail.com" });
  assert.equal((await onRequestPatch({ request: request(body, admin), env })).status, 200);
  assert.equal(await readUserSession(request(undefined, oldSession), env), null);
  const clientSession = await accountCookie(env, lawyerId);
  assert.equal((await lawyerProposals({ request: request(undefined, clientSession), env })).status, 401);
  assert.equal((await clientCases({ request: request(undefined, clientSession), env })).status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM case_proposals WHERE id = 'old-proposal'").first<{ n: number }>())?.n, 1);
  assert.equal((await onRequestPatch({ request: request(change(lawyerId, { confirmEmail: "mrecabarrend@gmail.com", expectedVersion: 1 }), admin), env })).status, 200);
  const after = await env.DB.prepare("SELECT credit_balance, plan_credit_balance, reserve_credit_balance, application_status FROM lawyer_profiles WHERE user_id = ?").bind(lawyerId).first();
  assert.deepEqual(after, before);
  assert.equal((await env.DB.prepare("SELECT status FROM users WHERE id = ?").bind(lawyerId).first<{ status: string }>())?.status, "active");
  assert.equal(await readUserSession(request(undefined, clientSession), env), null);
  const restored = await accountCookie(env, lawyerId);
  assert.equal((await clientCases({ request: request(undefined, restored), env })).status, 401);
  assert.equal((await lawyerProposals({ request: request(undefined, restored), env })).status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action = 'user.change_role' AND target_id = ?").bind(lawyerId).first<{ n: number }>())?.n, 2);
});

test("role conversion never lifts suspension and unapproved historical profiles stay pending", async () => {
  const env = environment(), admin = await administrator(env);
  await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").bind(clientId).run();
  assert.equal((await onRequestPatch({ request: request(change(), admin), env })).status, 200);
  assert.equal((await env.DB.prepare("SELECT status FROM users WHERE id = ?").bind(clientId).first<{ status: string }>())?.status, "suspended");
  await env.DB.prepare("UPDATE lawyer_profiles SET application_status = 'changes_requested' WHERE user_id = ?").bind(lawyerId).run();
  assert.equal((await onRequestPatch({ request: request(change(lawyerId, { role: "person", expectedRole: "lawyer", confirmEmail: "mrecabarrend@gmail.com" }), admin), env })).status, 200);
  assert.equal((await onRequestPatch({ request: request(change(lawyerId, { expectedVersion: 1, confirmEmail: "mrecabarrend@gmail.com" }), admin), env })).status, 200);
  assert.equal((await env.DB.prepare("SELECT status FROM users WHERE id = ?").bind(lawyerId).first<{ status: string }>())?.status, "pending");
});

test("role changes require admin, exact-email and consequence confirmation; never grant admin role", async () => {
  const env = environment(), admin = await administrator(env), client = await accountCookie(env, clientId);
  assert.equal((await onRequestPatch({ request: request(change()), env })).status, 401);
  assert.equal((await onRequestPatch({ request: request(change(), client), env })).status, 401);
  for (const invalid of [{ role: "admin" }, { role: "both" }, { expectedVersion: -1 }, { expectedVersion: "0" }, { expectedRole: "admin" }, { confirmEmail: "wrong@example.test" }, { confirmConsequences: false }]) {
    assert.equal((await onRequestPatch({ request: request(change(clientId, invalid), admin), env })).status, 400);
  }
  await env.DB.prepare("INSERT INTO users (id, email, full_name, role) VALUES ('admin-fixture', 'admin@example.test', 'Administrador ficticio', 'admin')").run();
  assert.equal((await onRequestPatch({ request: request(change("admin-fixture", { confirmEmail: "admin@example.test" }), admin), env })).status, 404);
  assert.equal((await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(clientId).first<{ role: string }>())?.role, "person");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action = 'user.change_role'").first<{ n: number }>())?.n, 0);
});

test("concurrent stale changes are rejected once; audit failure rolls the entire account change back", async () => {
  const env = environment(), admin = await administrator(env);
  const results = await Promise.all([onRequestPatch({ request: request(change(), admin), env }), onRequestPatch({ request: request(change(), admin), env })]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await env.DB.prepare("SELECT session_version FROM users WHERE id = ?").bind(clientId).first<{ session_version: number }>())?.session_version, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action = 'user.change_role'").first<{ n: number }>())?.n, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM account_transaction_guards").first<{ n: number }>())?.n, 0);
  const other = environment(), otherAdmin = await administrator(other), user = await accountCookie(other, clientId);
  other.DB.native.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON admin_audit_log WHEN NEW.action = 'user.change_role' BEGIN SELECT RAISE(ABORT, 'test_audit_unavailable'); END;");
  assert.equal((await onRequestPatch({ request: request(change(), otherAdmin), env: other })).status, 409);
  assert.equal((await other.DB.prepare("SELECT role FROM users WHERE id = ?").bind(clientId).first<{ role: string }>())?.role, "person");
  assert.equal((await other.DB.prepare("SELECT COUNT(*) n FROM lawyer_profiles WHERE user_id = ?").bind(clientId).first<{ n: number }>())?.n, 0);
  assert.ok(await readUserSession(request(undefined, user), other));
  assert.equal((await other.DB.prepare("SELECT COUNT(*) n FROM account_transaction_guards").first<{ n: number }>())?.n, 0);
});

test("historical professional applications cannot approve a client or lift suspension, including concurrent conversion", async () => {
  const review = { userId: lawyerId, decision: "approve", verificationMethod: "video", evidenceNote: "Revisión ficticia suficientemente extensa para esta prueba.", verifiedOriginals: true };
  const env = environment(), admin = await administrator(env);
  await env.DB.prepare("UPDATE lawyer_profiles SET application_status = 'submitted' WHERE user_id = ?").bind(lawyerId).run();
  assert.equal((await onRequestPatch({ request: request(change(lawyerId, { role: "person", expectedRole: "lawyer", confirmEmail: "mrecabarrend@gmail.com" }), admin), env })).status, 200);
  for (const decision of ["approve", "request_changes"]) assert.equal((await reviewApplication({ request: request({ ...review, decision }, admin), env })).status, 409);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM lawyer_verifications WHERE lawyer_id = ?").bind(lawyerId).first<{ n: number }>())?.n, 0);
  const suspended = environment(), suspendedAdmin = await administrator(suspended);
  await suspended.DB.prepare("UPDATE lawyer_profiles SET application_status = 'submitted' WHERE user_id = ?").bind(lawyerId).run();
  await suspended.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").bind(lawyerId).run();
  assert.equal((await reviewApplication({ request: request(review, suspendedAdmin), env: suspended })).status, 409);
  assert.equal((await suspended.DB.prepare("SELECT status FROM users WHERE id = ?").bind(lawyerId).first<{ status: string }>())?.status, "suspended");
  const concurrent = environment(), concurrentAdmin = await administrator(concurrent);
  await concurrent.DB.prepare("UPDATE lawyer_profiles SET application_status = 'submitted' WHERE user_id = ?").bind(lawyerId).run();
  await concurrent.DB.prepare("UPDATE users SET status = 'pending' WHERE id = ?").bind(lawyerId).run();
  const results = await Promise.all([
    onRequestPatch({ request: request(change(lawyerId, { role: "person", expectedRole: "lawyer", confirmEmail: "mrecabarrend@gmail.com" }), concurrentAdmin), env: concurrent }),
    reviewApplication({ request: request(review, concurrentAdmin), env: concurrent }),
  ]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  const account = await concurrent.DB.prepare("SELECT role, status FROM users WHERE id = ?").bind(lawyerId).first<{ role: string; status: string }>();
  if (account?.role === "person") {
    assert.equal(account.status, "active");
    assert.equal((await concurrent.DB.prepare("SELECT COUNT(*) n FROM lawyer_verifications WHERE lawyer_id = ?").bind(lawyerId).first<{ n: number }>())?.n, 0);
  }
});

test("new acceptance requires a current active approved lawyer and preserves historical proposals when unavailable", async () => {
  for (const state of ["person", "suspended", "unapproved"] as const) {
    const env = environment(), client = await accountCookie(env, clientId);
    await env.DB.prepare("INSERT INTO legal_cases (id, person_id, category, title, description) VALUES ('acceptance-case', ?, 'Derecho Penal', 'Caso ficticio de aceptación', 'Datos ficticios.')").bind(clientId).run();
    await env.DB.prepare("INSERT INTO case_proposals (id, case_id, lawyer_id, message) VALUES ('pending-proposal', 'acceptance-case', ?, 'Propuesta ficticia conservada.')").bind(lawyerId).run();
    if (state === "person") await env.DB.prepare("UPDATE users SET role = 'person' WHERE id = ?").bind(lawyerId).run();
    if (state === "suspended") await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").bind(lawyerId).run();
    if (state === "unapproved") await env.DB.prepare("UPDATE lawyer_profiles SET application_status = 'changes_requested' WHERE user_id = ?").bind(lawyerId).run();
    const response = await decideProposal({ request: request({ proposalId: "pending-proposal", action: "accept" }, client), env });
    assert.equal(response.status, 409, state);
    assert.equal((await env.DB.prepare("SELECT status FROM legal_cases WHERE id = 'acceptance-case'").first<{ status: string }>())?.status, "open");
    assert.equal((await env.DB.prepare("SELECT status FROM case_proposals WHERE id = 'pending-proposal'").first<{ status: string }>())?.status, "sent");
    assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM account_transaction_guards").first<{ n: number }>())?.n, 0);
  }
});

test("acceptance rechecks role inside its atomic batch and concurrent duplicate acceptance notifies only once", async () => {
  function beforeBatchRace(env: ReturnType<typeof environment>) {
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => {
      env.DB.native.prepare("UPDATE users SET role = 'person', session_version = session_version + 1 WHERE id = ?").run(lawyerId);
      return batch(statements);
    };
  }
  async function setup(env: ReturnType<typeof environment>) {
    await env.DB.prepare("INSERT INTO legal_cases (id, person_id, category, title, description) VALUES ('race-acceptance', ?, 'Derecho Penal', 'Caso ficticio', 'Datos ficticios.')").bind(clientId).run();
    await env.DB.prepare("INSERT INTO case_proposals (id, case_id, lawyer_id, message) VALUES ('race-proposal', 'race-acceptance', ?, 'Propuesta ficticia conservada.')").bind(lawyerId).run();
  }
  const env = environment(), client = await accountCookie(env, clientId);
  await setup(env); beforeBatchRace(env);
  assert.equal((await decideProposal({ request: request({ proposalId: "race-proposal", action: "accept" }, client), env })).status, 409);
  assert.equal((await env.DB.prepare("SELECT status FROM case_proposals WHERE id = 'race-proposal'").first<{ status: string }>())?.status, "sent");
  assert.equal((await env.DB.prepare("SELECT status FROM legal_cases WHERE id = 'race-acceptance'").first<{ status: string }>())?.status, "open");
  const parallel = environment(), parallelClient = await accountCookie(parallel, clientId); await setup(parallel);
  const responses = await Promise.all([
    decideProposal({ request: request({ proposalId: "race-proposal", action: "accept" }, parallelClient), env: parallel }),
    decideProposal({ request: request({ proposalId: "race-proposal", action: "accept" }, parallelClient), env: parallel }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await parallel.DB.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'Tu propuesta fue aceptada'").bind(lawyerId).first<{ n: number }>())?.n, 1);
});
