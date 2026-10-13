import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { createUserSession } from "../functions/_lib/user-auth";
import { createSession } from "../functions/_lib/github-auth";
import type { LawyerBillingResponse } from "../shared/billing";
import worker from "../src/worker";

// Complete HTTP dispatch against isolated SQLite; no production accounts or payments.
function environment() {
  return { DB: new TestDb(), USER_AUTH_SECRET: "flow-fixture-user-secret", AUTH_SESSION_SECRET: "flow-fixture-admin-secret", ASSETS: { fetch: async () => new Response("fixture asset") } } as unknown as Parameters<typeof worker.fetch>[1];
}
function request(path: string, method = "GET", body?: unknown, cookie = "", origin = "https://jurisconecta.cl") {
  return new Request(`https://jurisconecta.cl${path}`, { method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function userCookie(env: ReturnType<typeof environment>, id: string, role: "person" | "lawyer") {
  return `juris_user=${await createUserSession({ id, role, fullName: "Cuenta de prueba", email: `${id}@example.test`, sessionVersion: 0 }, env, request("/"))}`;
}
const clientId = "person-cliente-prueba", lawyerId = "lawyer-maria-recabarren";
async function publish(env: ReturnType<typeof environment>, cookie: string) {
  const response = await worker.fetch(request("/api/cases", "POST", { category: "Derecho Familiar", topic: "Divorcio", situation: "Situación completamente ficticia para probar el flujo y los créditos.", desiredOutcome: "Recibir orientación ficticia de prueba.", attentionMode: "remote", region: "Región Metropolitana", commune: "Santiago" }, cookie), env);
  assert.equal(response.status, 201);
  return (await response.json() as { id: string }).id;
}

test("HTTP case flow protects contact until acceptance and debits a split wallet exactly once", async () => {
  const env = environment(), client = await userCookie(env, clientId, "person"), lawyer = await userCookie(env, lawyerId, "lawyer"), other = await userCookie(env, "lawyer-pablo-martin", "lawyer");
  await env.DB.prepare("UPDATE lawyer_profiles SET plan_credit_balance = 2, reserve_credit_balance = 10, subscription_status = 'trial', renewal_date = ? WHERE user_id = ?").bind(new Date(Date.now() + 30 * 86400000).toISOString(), lawyerId).run();
  const caseId = await publish(env, client);
  assert.equal((await worker.fetch(request("/api/lawyer/cases?action=access", "POST", { caseId }, lawyer), env)).status, 403);
  const created = await worker.fetch(request("/api/lawyer/proposals", "POST", { caseId, message: "Propuesta suficientemente extensa, ficticia y sin contacto personal.", feeAmount: 1000 }, lawyer), env);
  assert.equal(created.status, 201);
  const proposalId = (await created.json() as { id: string }).id;
  assert.equal((await worker.fetch(request("/api/client/proposals", "PATCH", { proposalId, action: "accept" }, lawyer), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/client/proposals", "PATCH", { proposalId, action: "accept" }, client), env)).status, 200);
  assert.equal((await worker.fetch(request("/api/lawyer/cases?action=access", "POST", { caseId }, other), env)).status, 403);
  const [one, two] = await Promise.all([worker.fetch(request("/api/lawyer/cases?action=access", "POST", { caseId }, lawyer), env), worker.fetch(request("/api/lawyer/cases?action=access", "POST", { caseId }, lawyer), env)]);
  assert.equal(one.status, 200); assert.equal(two.status, 200);
  const wallet = await env.DB.prepare("SELECT plan_credit_balance, reserve_credit_balance, credit_balance FROM lawyer_profiles WHERE user_id = ?").bind(lawyerId).first<{ plan_credit_balance: number; reserve_credit_balance: number; credit_balance: number }>();
  assert.deepEqual({ ...wallet }, { plan_credit_balance: 0, reserve_credit_balance: 7, credit_balance: 7 });
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM credit_movements WHERE operation = 'case_access' AND related_case_id = ?").bind(caseId).first<{ n: number }>())?.n, 1);
  assert.equal((await worker.fetch(request("/api/lawyer/cases?view=accessed", "GET", undefined, lawyer), env)).status, 200);
  assert.equal((await worker.fetch(request("/api/cases", "PATCH", { id: caseId, action: "close" }, client), env)).status, 200);
});

test("HTTP billing routes enforce CSRF/roles, configurable new-case cost and idempotent plan changes", async () => {
  const env = environment(), client = await userCookie(env, clientId, "person"), lawyer = await userCookie(env, lawyerId, "lawyer"), owner = `juris_admin=${await createSession("gprecabarren", env, request("/admin"))}`;
  assert.equal((await worker.fetch(request("/api/admin/billing"), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/lawyer/plans", "GET", undefined, client), env)).status, 401);
  const catalog = await (await worker.fetch(request("/api/admin/billing", "GET", undefined, owner), env)).json() as { config: Record<string, unknown> & { version: number }; plans: unknown[] };
  const body = { expectedVersion: catalog.config.version, config: { ...catalog.config, defaultCaseCreditCost: 0 }, plans: catalog.plans };
  assert.equal((await worker.fetch(request("/api/admin/billing", "PATCH", body, owner, "https://evil.example"), env)).status, 403);
  const olderCase = await publish(env, client);
  assert.equal((await worker.fetch(request("/api/admin/billing", "PATCH", body, owner), env)).status, 200);
  const newerCase = await publish(env, client);
  const costs = await env.DB.prepare("SELECT id, credit_cost FROM legal_cases WHERE id IN (?, ?) ORDER BY credit_cost DESC").bind(olderCase, newerCase).all<{ id: string; credit_cost: number }>();
  assert.deepEqual(costs.results.map((item) => item.credit_cost), [5, 0]);
  const plans = await (await worker.fetch(request("/api/lawyer/plans", "GET", undefined, lawyer), env)).json() as LawyerBillingResponse;
  const change = { action: "select_plan", planCode: "gold", expectedVersion: plans.profile.billing_version, idempotencyKey: crypto.randomUUID(), confirm: true };
  assert.equal((await worker.fetch(request("/api/lawyer/plans", "POST", change, lawyer, "https://evil.example"), env)).status, 403);
  assert.equal((await worker.fetch(request("/api/lawyer/plans", "POST", change, lawyer), env)).status, 200);
  const repeated = await worker.fetch(request("/api/lawyer/plans", "POST", change, lawyer), env);
  assert.equal(repeated.status, 200); assert.equal((await repeated.json() as { replayed: boolean }).replayed, true);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM credit_movements WHERE lawyer_id = ? AND operation = 'select_plan'").bind(lawyerId).first<{ n: number }>())?.n, 1);
  assert.equal((await worker.fetch(request("/api/lawyer/plans", "POST", { ...change, action: "payment_success", paid: true }, lawyer), env)).status, 400);
});
