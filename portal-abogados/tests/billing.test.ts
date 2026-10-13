import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { BillingError, changeLawyerBilling, ensureCurrentBilling, readBillingConfig, readBillingPlans, readBillingProfile, readCreditLedger } from "../functions/_lib/billing";
import { createSession } from "../functions/_lib/github-auth";
import { createUserSession } from "../functions/_lib/user-auth";
import { onRequestGet as getAdmin, onRequestPatch as configure, onRequestPost as adjust } from "../functions/api/admin/billing";
import { onRequestGet as getPlans, onRequestPost as changePlan } from "../functions/api/lawyer/plans";
import { onRequestPost as accessCase } from "../functions/api/lawyer/cases";
import { onRequestPatch as approve } from "../functions/api/admin/applications";

const lawyer = "lawyer-maria-recabarren";
function environment() { return { DB: new TestDb(), USER_AUTH_SECRET: "local-billing-user-secret", AUTH_SESSION_SECRET: "local-billing-admin-secret" }; }
function request(path: string, method = "GET", body?: unknown, cookie = "") {
  return new Request(`https://jurisconecta.cl${path}`, { method, headers: { Origin: "https://jurisconecta.cl", Cookie: cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function ownerCookie(env: ReturnType<typeof environment>) { return `juris_admin=${await createSession("gprecabarren", env, request("/admin"))}`; }
async function lawyerCookie(env: ReturnType<typeof environment>) { return `juris_user=${await createUserSession({ id: lawyer, email: "lawyer@example.test", fullName: "Prueba", role: "lawyer", sessionVersion: 0 }, env, request("/"))}`; }
async function currentWallet(db: TestDb, plan = 200, reserve = 191) {
  await db.prepare("UPDATE lawyer_profiles SET plan_credit_balance = ?, reserve_credit_balance = ?, renewal_date = ?, subscription_status = 'trial' WHERE user_id = ?").bind(plan, reserve, new Date(Date.now() + 86400000 * 30).toISOString(), lawyer).run();
  return readBillingProfile(db, lawyer);
}
async function matchedCase(db: TestDb, id: string, cost: number, accepted = true) {
  await db.prepare("INSERT INTO legal_cases (id, person_id, category, title, description, status, credit_cost) VALUES (?, 'person-cliente-prueba', 'Derecho Penal', 'Caso de prueba', 'Descripción de prueba', 'matched', ?)").bind(id, cost).run();
  if (accepted) await db.prepare("INSERT INTO case_proposals (id, case_id, lawyer_id, message, fee_amount, status) VALUES (?, ?, ?, 'Propuesta de prueba válida', 1000, 'accepted')").bind(crypto.randomUUID(), id, lawyer).run();
}
async function directAccess(db: TestDb, id: string, cost: number) { await db.prepare("INSERT INTO case_accesses (case_id, lawyer_id, credits_spent, contact_snapshot_json) VALUES (?, ?, ?, '{}')").bind(id, lawyer, cost).run(); }
const action = (expectedVersion: number, choice: "select_plan" | "renew" | "cancel" = "select_plan", planCode = "gold", idempotencyKey = crypto.randomUUID()) => ({ action: choice, planCode, expectedVersion, idempotencyKey, confirm: true });

test("billing migration preserves all legacy credits in reserve, with immutable import movements", async () => {
  const db = new TestDb();
  const profile = await readBillingProfile(db, lawyer);
  assert.equal(profile.credit_balance, 191); assert.equal(profile.plan_credit_balance, 0); assert.equal(profile.reserve_credit_balance, 191);
  const goldLegacy = await readBillingProfile(db, "lawyer-pablo-martin");
  assert.equal(goldLegacy.reserve_credit_balance, 488);
  const legacy = await readCreditLedger(db, lawyer);
  assert.equal(legacy[0].operation, "legacy_import"); assert.equal(legacy[0].reserve_delta, 191);
  const plans = await readBillingPlans(db);
  assert.deepEqual(plans.map((plan) => [plan.code, plan.monthly_credits, plan.monthly_price_uf, plan.monthly_price_clp, plan.extra_credit_price_clp]), [["premium", 100, 1.8, 74100, 1343], ["silver", 200, 3, 123500, 1155], ["gold", 400, 5, 205800, 924]]);
  assert.equal((await readBillingConfig(db)).mode, "free");
});

test("lazy free renewal creates only one current period and never accumulates missed months", async () => {
  const db = new TestDb();
  await db.prepare("UPDATE lawyer_profiles SET plan_credit_balance = 10, reserve_credit_balance = 191, renewal_date = '2020-01-01', subscription_status = 'trial' WHERE user_id = ?").bind(lawyer).run();
  const now = Date.now();
  const [one, two] = await Promise.all([ensureCurrentBilling(db, lawyer, now), ensureCurrentBilling(db, lawyer, now)]);
  assert.equal(one.credit_balance, 401); assert.equal(two.credit_balance, 401);
  assert.equal(one.reserve_credit_balance, 201); assert.equal(one.plan_credit_balance, 200);
  assert.equal(Date.parse(one.renewal_date!) - now, 30 * 86400000);
  assert.equal((await readCreditLedger(db, lawyer)).filter((entry) => entry.operation === "auto_renew").length, 1);
  const unchanged = await ensureCurrentBilling(db, lawyer, now + 1000);
  assert.equal(unchanged.billing_version, one.billing_version);
  await db.prepare("UPDATE lawyer_profiles SET application_status = 'draft', renewal_date = '2020-01-01' WHERE user_id = ?").bind(lawyer).run();
  assert.equal((await ensureCurrentBilling(db, lawyer, now)).credit_balance, 401);
});

test("change, early renewal and cancellation keep plan and reserve balances separate and idempotent", async () => {
  const db = new TestDb();
  const before = await currentWallet(db, 195, 191);
  const choose = action(before.billing_version);
  assert.equal(await changeLawyerBilling(db, lawyer, choose), false);
  assert.equal(await changeLawyerBilling(db, lawyer, choose), true);
  let after = await readBillingProfile(db, lawyer);
  assert.equal(after.plan_credit_balance, 400); assert.equal(after.reserve_credit_balance, 386); assert.equal(after.credit_balance, 786);
  await assert.rejects(changeLawyerBilling(db, lawyer, { ...choose, planCode: "premium" }), /clave.*otra solicitud/);
  await changeLawyerBilling(db, lawyer, action(after.billing_version, "renew"));
  after = await readBillingProfile(db, lawyer);
  assert.equal(after.plan_credit_balance, 400); assert.equal(after.reserve_credit_balance, 786);
  await changeLawyerBilling(db, lawyer, action(after.billing_version, "cancel"));
  after = await readBillingProfile(db, lawyer);
  assert.equal(after.plan_credit_balance, 0); assert.equal(after.reserve_credit_balance, 786); assert.equal(after.renewal_date, null); assert.equal(after.subscription_status, "cancelled");
  assert.equal((await ensureCurrentBilling(db, lawyer)).credit_balance, 786);
  await assert.rejects(changeLawyerBilling(db, lawyer, action(after.billing_version, "renew")), /Selecciona un plan/);
  assert.equal((await readCreditLedger(db, lawyer)).filter((entry) => entry.operation === "select_plan").length, 1);
});

test("wallet optimistic locking prevents double allocation and conflicting simultaneous changes", async () => {
  const db = new TestDb();
  let before = await currentWallet(db);
  const choose = action(before.billing_version);
  const duplicate = await Promise.all([changeLawyerBilling(db, lawyer, choose), changeLawyerBilling(db, lawyer, choose)]);
  assert.deepEqual(duplicate.sort(), [false, true]);
  before = await readBillingProfile(db, lawyer);
  const conflicting = await Promise.allSettled([changeLawyerBilling(db, lawyer, action(before.billing_version, "renew")), changeLawyerBilling(db, lawyer, action(before.billing_version, "cancel"))]);
  assert.equal(conflicting.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(conflicting.filter((entry) => entry.status === "rejected").length, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM billing_transaction_guards").first<{ n: number }>())?.n, 0);
});

test("case debit requires accepted proposal/current cost, spends plan first, supports zero and never goes negative", async () => {
  const db = new TestDb();
  await currentWallet(db, 2, 10);
  await matchedCase(db, "unaccepted", 5, false);
  await assert.rejects(directAccess(db, "unaccepted", 5), /proposal_not_accepted/);
  await matchedCase(db, "accepted", 5);
  await assert.rejects(directAccess(db, "accepted", 0), /invalid_case_access/);
  await directAccess(db, "accepted", 5);
  let after = await readBillingProfile(db, lawyer);
  assert.equal(after.plan_credit_balance, 0); assert.equal(after.reserve_credit_balance, 7); assert.equal(after.credit_balance, 7);
  const movement = (await readCreditLedger(db, lawyer)).find((entry) => entry.related_case_id === "accepted");
  assert.equal(movement?.plan_delta, -2); assert.equal(movement?.reserve_delta, -3);
  await assert.rejects(directAccess(db, "accepted", 5), /UNIQUE/);
  await matchedCase(db, "too-expensive", 8);
  await assert.rejects(directAccess(db, "too-expensive", 8), /insufficient_credits/);
  await matchedCase(db, "free-case", 0);
  await directAccess(db, "free-case", 0);
  after = await readBillingProfile(db, lawyer);
  assert.equal(after.credit_balance, 7);
  const zero = (await readCreditLedger(db, lawyer)).find((entry) => entry.related_case_id === "free-case");
  assert.equal(zero?.plan_delta, 0); assert.equal(zero?.reserve_delta, 0);
});

test("owner config validates all fields, uses optimistic locking, audits atomically and keeps reserve safe", async () => {
  const env = environment(), cookie = await ownerCookie(env);
  const config = await readBillingConfig(env.DB), plans = await readBillingPlans(env.DB, true);
  const payload = { expectedVersion: config.version, config: { ...config, periodDays: 7, defaultCaseCreditCost: 0 }, plans };
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", { ...payload, config: { ...payload.config, preserveReserveOnCancel: false } }, cookie), env })).status, 400);
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", { ...payload, plans: plans.map((plan) => ({ ...plan, active: false, featured: false })) }, cookie), env })).status, 400);
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", { ...payload, config: { ...payload.config, maxBalance: 400 } }, cookie), env })).status, 409);
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", payload, cookie), env })).status, 200);
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", payload, cookie), env })).status, 409);
  const after = await readBillingConfig(env.DB);
  assert.equal(after.version, config.version + 1); assert.equal(after.periodDays, 7); assert.equal(after.defaultCaseCreditCost, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action = 'billing.configure'").first<{ n: number }>())?.n, 1);
});

test("PAID is fail-closed: no client allocation, renewal, forged payment or new case access", async () => {
  const env = environment(), cookie = await ownerCookie(env), userCookie = await lawyerCookie(env);
  const before = await currentWallet(env.DB);
  const config = await readBillingConfig(env.DB), plans = await readBillingPlans(env.DB, true);
  const payload = { expectedVersion: config.version, config: { ...config, mode: "paid" }, plans };
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", payload, cookie), env })).status, 400);
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", { ...payload, confirmModeChange: true }, cookie), env })).status, 200);
  await assert.rejects(changeLawyerBilling(env.DB, lawyer, action(before.billing_version)), (error: unknown) => error instanceof BillingError && error.status === 503);
  await assert.rejects(changeLawyerBilling(env.DB, lawyer, action(before.billing_version, "renew")), /pagos aún no/);
  const forged = await changePlan({ request: request("/api/lawyer/plans", "POST", { action: "payment_success", provider: "test", paid: true, credits: 999999 }, userCookie), env });
  assert.equal(forged.status, 400);
  await matchedCase(env.DB, "paid-case", 5);
  await assert.rejects(directAccess(env.DB, "paid-case", 5), /invalid_case_access/);
  assert.equal((await accessCase({ request: request("/api/lawyer/cases?action=access", "POST", { caseId: "paid-case" }, userCookie), env })).status, 503);
  assert.equal((await readBillingProfile(env.DB, lawyer)).credit_balance, before.credit_balance);
  await env.DB.prepare("UPDATE lawyer_profiles SET renewal_date = '2020-01-01' WHERE user_id = ?").bind(lawyer).run();
  const expired = await ensureCurrentBilling(env.DB, lawyer);
  assert.equal(expired.plan_credit_balance, 0); assert.equal(expired.reserve_credit_balance, before.credit_balance); assert.equal(expired.subscription_status, "past_due");
  assert.equal((await ensureCurrentBilling(env.DB, lawyer)).billing_version, expired.billing_version);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM billing_operations").first<{ n: number }>())?.n, 0);
});

test("only owner edits economics; ordinary GitHub admins have read-only config and wallet lookup", async () => {
  const env = environment();
  await env.DB.prepare("INSERT INTO github_administrators (github_id, github_login, role) VALUES (89001, 'billing-reader', 'admin')").run();
  const cookie = `juris_admin=${await createSession("billing-reader", env, request("/admin"))}`;
  assert.equal((await getAdmin({ request: request("/api/admin/billing"), env })).status, 401);
  const response = await getAdmin({ request: request(`/api/admin/billing?userId=${lawyer}`, "GET", undefined, cookie), env });
  assert.equal(response.status, 200);
  const data = await response.json() as { canManage: boolean; target: { profile: { credit_balance: number } } };
  assert.equal(data.canManage, false); assert.equal(data.target.profile.credit_balance, 191);
  assert.equal((await configure({ request: request("/api/admin/billing", "PATCH", {}, cookie), env })).status, 403);
  assert.equal((await adjust({ request: request("/api/admin/billing", "POST", {}, cookie), env })).status, 403);
});

test("manual reserve adjustments require reason/version, reject negative balances and audit one time", async () => {
  const env = environment(), cookie = await ownerCookie(env);
  const before = await readBillingProfile(env.DB, lawyer);
  const payload = { action: "adjust_reserve", userId: lawyer, delta: 20, note: "Ajuste controlado de prueba", expectedVersion: before.billing_version, idempotencyKey: crypto.randomUUID(), confirm: true };
  assert.equal((await adjust({ request: request("/api/admin/billing", "POST", payload, cookie), env })).status, 200);
  const repeated = await adjust({ request: request("/api/admin/billing", "POST", payload, cookie), env });
  assert.equal(repeated.status, 200); assert.equal((await repeated.json() as { replayed: boolean }).replayed, true);
  const after = await readBillingProfile(env.DB, lawyer);
  assert.equal(after.reserve_credit_balance, 211);
  assert.equal((await adjust({ request: request("/api/admin/billing", "POST", { ...payload, expectedVersion: after.billing_version, delta: -212, idempotencyKey: crypto.randomUUID() }, cookie), env })).status, 409);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action = 'billing.adjust_reserve'").first<{ n: number }>())?.n, 1);
});

test("approval in PAID verifies profession but never gifts paid credits or charges", async () => {
  const env = environment(), cookie = await ownerCookie(env);
  await env.DB.prepare("UPDATE billing_config SET mode = 'paid'").run();
  await env.DB.prepare("UPDATE lawyer_profiles SET application_status = 'submitted' WHERE user_id = ?").bind(lawyer).run();
  await env.DB.prepare("UPDATE users SET status = 'pending' WHERE id = ?").bind(lawyer).run();
  const response = await approve({ request: request("/api/admin/applications", "PATCH", { userId: lawyer, decision: "approve", verificationMethod: "video", evidenceNote: "Se revisaron originales en videollamada de prueba.", verifiedOriginals: true }, cookie), env });
  assert.equal(response.status, 200);
  const after = await readBillingProfile(env.DB, lawyer);
  assert.equal(after.application_status, "approved"); assert.equal(after.plan_credit_balance, 0); assert.equal(after.reserve_credit_balance, 191); assert.equal(after.subscription_status, "past_due");
  assert.equal((await ensureCurrentBilling(env.DB, lawyer)).credit_balance, 191);
});

test("authenticated plans endpoint is bounded, disables inactive plans and honors policy limits", async () => {
  const env = environment(), cookie = await lawyerCookie(env);
  const before = await currentWallet(env.DB);
  assert.equal((await getPlans({ request: request("/api/lawyer/plans"), env })).status, 401);
  assert.equal((await getPlans({ request: request("/api/lawyer/plans", "GET", undefined, cookie), env })).status, 200);
  assert.equal((await changePlan({ request: request("/api/lawyer/plans", "POST", { ...action(before.billing_version), oversized: "x".repeat(5000) }, cookie), env })).status, 400);
  await env.DB.prepare("UPDATE subscription_plans SET active = 0 WHERE code = 'gold'").run();
  await assert.rejects(changeLawyerBilling(env.DB, lawyer, action(before.billing_version)), /no está disponible/);
  await env.DB.prepare("UPDATE billing_config SET allow_early_renewal = 0").run();
  await assert.rejects(changeLawyerBilling(env.DB, lawyer, action(before.billing_version, "renew")), /anticipada.*deshabilitada/);
  await env.DB.prepare("UPDATE billing_config SET allow_early_renewal = 1, max_balance = 400").run();
  await assert.rejects(changeLawyerBilling(env.DB, lawyer, action(before.billing_version, "renew")), /saldo supera/);
  assert.equal((await readBillingProfile(env.DB, lawyer)).credit_balance, before.credit_balance);
});

test("lazy renewal at the balance cap keeps the panel usable without allocation or reserve loss", async () => {
  const db = new TestDb();
  await currentWallet(db, 200, 200);
  await db.prepare("UPDATE billing_config SET max_balance = 400").run();
  await db.prepare("UPDATE lawyer_profiles SET renewal_date = '2020-01-01' WHERE user_id = ?").bind(lawyer).run();
  const after = await ensureCurrentBilling(db, lawyer);
  assert.equal(after.credit_balance, 400); assert.equal(after.reserve_credit_balance, 400); assert.equal(after.plan_credit_balance, 0); assert.equal(after.subscription_status, "past_due");
  assert.equal((await readCreditLedger(db, lawyer))[0].operation, "period_expiry");
  assert.equal((await ensureCurrentBilling(db, lawyer)).billing_version, after.billing_version);
  await db.prepare("UPDATE billing_config SET max_balance = 1000, version = version + 1").run();
  const renewed = await ensureCurrentBilling(db, lawyer);
  assert.equal(renewed.plan_credit_balance, 200); assert.equal(renewed.reserve_credit_balance, 400);
  assert.equal((await ensureCurrentBilling(db, lawyer)).billing_version, renewed.billing_version);
  assert.equal((await readCreditLedger(db, lawyer)).filter((entry) => entry.operation === "auto_renew").length, 1);
});
