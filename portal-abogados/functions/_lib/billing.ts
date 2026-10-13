import type { BillingConfig, BillingPlan, BillingProfile, CreditLedgerEntry, PlanCode } from "../../shared/billing";
import type { D1Database, D1Statement } from "./user-auth";

const planCodes = new Set<unknown>(["premium", "silver", "gold"]);
export function isPlanCode(value: unknown): value is PlanCode { return planCodes.has(value); }
export function validBillingKey(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
export function integer(value: unknown, minimum: number, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
type ConfigRow = { version: number; mode: "free" | "paid"; period_days: number; default_case_credit_cost: number; rollover_on_renewal: number; rollover_on_change: number; preserve_reserve_on_cancel: number; free_auto_renew: number; allow_early_renewal: number; max_balance: number; updated_at: string };
type PlanRow = { code: PlanCode; name: string; monthly_credits: number; monthly_price_clp: number; monthly_price_uf_hundredths: number; extra_credit_price_clp: number; description: string; benefits_json: string; sort_order: number; active: number; featured: number };
type WalletRow = BillingProfile & { user_status: string };
export class BillingError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function readBillingConfig(db: D1Database): Promise<BillingConfig> {
  const row = await db.prepare("SELECT * FROM billing_config WHERE id = 1").first<ConfigRow>();
  if (!row) throw new BillingError("La configuración de créditos aún no está disponible.", 503);
  return { version: row.version, mode: row.mode, periodDays: row.period_days, defaultCaseCreditCost: row.default_case_credit_cost, rolloverOnRenewal: Boolean(row.rollover_on_renewal), rolloverOnChange: Boolean(row.rollover_on_change), preserveReserveOnCancel: true, freeAutoRenew: Boolean(row.free_auto_renew), allowEarlyRenewal: Boolean(row.allow_early_renewal), maxBalance: row.max_balance, updatedAt: row.updated_at };
}
export async function readBillingPlans(db: D1Database, includeInactive = false): Promise<BillingPlan[]> {
  const { results } = await db.prepare("SELECT * FROM subscription_plans WHERE active = 1 OR ? = 1 ORDER BY sort_order, code").bind(includeInactive ? 1 : 0).all<PlanRow>();
  return results.map((row) => {
    const parsed: unknown = JSON.parse(row.benefits_json);
    const benefits = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    return { code: row.code, name: row.name, monthly_credits: row.monthly_credits, monthly_price_clp: row.monthly_price_clp, monthly_price_uf: row.monthly_price_uf_hundredths / 100, extra_credit_price_clp: row.extra_credit_price_clp, description: row.description, benefits, sort_order: row.sort_order, active: Boolean(row.active), featured: Boolean(row.featured) };
  });
}
export async function readBillingProfile(db: D1Database, userId: string): Promise<WalletRow> {
  const profile = await db.prepare("SELECT lp.plan_code, lp.credit_balance, lp.plan_credit_balance, lp.reserve_credit_balance, lp.renewal_date, lp.subscription_status, lp.billing_version, lp.period_mode, lp.application_status, u.status AS user_status FROM lawyer_profiles lp JOIN users u ON u.id = lp.user_id WHERE lp.user_id = ? AND u.role = 'lawyer'").bind(userId).first<WalletRow>();
  if (!profile) throw new BillingError("No encontramos tu perfil de abogado.", 404);
  return profile;
}
export async function readCreditLedger(db: D1Database, userId: string): Promise<CreditLedgerEntry[]> {
  return (await db.prepare("SELECT id, operation, plan_delta, reserve_delta, plan_balance_after, reserve_balance_after, related_case_id, note, created_at FROM credit_movements WHERE lawyer_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100").bind(userId).all<CreditLedgerEntry>()).results;
}

export function parseBillingUpdate(body: Record<string, unknown>): { expectedVersion: number; config: Omit<BillingConfig, "version" | "updatedAt">; plans: BillingPlan[]; confirmModeChange: boolean } | null {
  const value = body.config;
  if (!integer(body.expectedVersion, 1, 2_000_000_000) || !record(value) || (value.mode !== "free" && value.mode !== "paid") || !integer(value.periodDays, 1, 365) || !integer(value.maxBalance, 1, 1000000) || !integer(value.defaultCaseCreditCost, 0, Math.min(10000, value.maxBalance)) || typeof value.rolloverOnRenewal !== "boolean" || typeof value.rolloverOnChange !== "boolean" || value.preserveReserveOnCancel !== true || typeof value.freeAutoRenew !== "boolean" || typeof value.allowEarlyRenewal !== "boolean" || !Array.isArray(body.plans) || body.plans.length !== 3) return null;
  const plans: BillingPlan[] = [];
  for (const item of body.plans) {
    if (!record(item) || !isPlanCode(item.code) || typeof item.name !== "string" || item.name.trim().length < 2 || item.name.length > 60 || !integer(item.monthly_credits, 1, Math.min(10000, value.maxBalance)) || !integer(item.monthly_price_clp, 0, 100000000) || typeof item.monthly_price_uf !== "number" || !Number.isFinite(item.monthly_price_uf) || item.monthly_price_uf < 0 || item.monthly_price_uf > 10000 || Math.abs(item.monthly_price_uf * 100 - Math.round(item.monthly_price_uf * 100)) > 0.000001 || !integer(item.extra_credit_price_clp, 0, 100000000) || typeof item.description !== "string" || item.description.trim().length < 10 || item.description.length > 500 || !integer(item.sort_order, 0, 100) || typeof item.active !== "boolean" || typeof item.featured !== "boolean" || !Array.isArray(item.benefits) || item.benefits.length > 8 || item.benefits.some((benefit) => typeof benefit !== "string" || benefit.trim().length < 1 || benefit.length > 180)) return null;
    plans.push({ code: item.code, name: item.name.trim(), monthly_credits: item.monthly_credits, monthly_price_clp: item.monthly_price_clp, monthly_price_uf: item.monthly_price_uf, extra_credit_price_clp: item.extra_credit_price_clp, description: item.description.trim(), sort_order: item.sort_order, active: item.active, featured: item.featured, benefits: item.benefits.map((benefit: string) => benefit.trim()) });
  }
  if (new Set(plans.map((plan) => plan.code)).size !== 3 || new Set(plans.map((plan) => plan.name.toLowerCase())).size !== 3 || !plans.some((plan) => plan.active) || plans.filter((plan) => plan.featured).length > 1 || plans.some((plan) => plan.featured && !plan.active)) return null;
  return { expectedVersion: body.expectedVersion, config: { mode: value.mode, periodDays: value.periodDays, defaultCaseCreditCost: value.defaultCaseCreditCost, maxBalance: value.maxBalance, rolloverOnRenewal: value.rolloverOnRenewal, rolloverOnChange: value.rolloverOnChange, preserveReserveOnCancel: true, freeAutoRenew: value.freeAutoRenew, allowEarlyRenewal: value.allowEarlyRenewal }, plans, confirmModeChange: body.confirmModeChange === true };
}

/** Explicit assertion statement: an outdated wallet/config rolls back the complete D1 batch. */
export function billingGuard(db: D1Database, guardId: string, userId: string, walletVersion: number, configVersion: number, requireApproved = false) {
  return db.prepare("INSERT INTO billing_transaction_guards (id, valid) SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM lawyer_profiles lp JOIN users u ON u.id = lp.user_id WHERE lp.user_id = ? AND lp.billing_version = ? AND (? = 0 OR (u.status = 'active' AND lp.application_status = 'approved'))) AND EXISTS (SELECT 1 FROM billing_config WHERE id = 1 AND version = ?) THEN 1 ELSE 0 END").bind(guardId, userId, walletVersion, requireApproved ? 1 : 0, configVersion);
}
export function clearBillingGuard(db: D1Database, guardId: string) { return db.prepare("DELETE FROM billing_transaction_guards WHERE id = ?").bind(guardId); }
type WalletChange = { planCode: PlanCode; planBalance: number; reserveBalance: number; renewalDate: string | null; subscriptionStatus: string; periodMode: "free" | "paid" };
export function walletStatements(db: D1Database, userId: string, before: BillingProfile, after: WalletChange, operation: string, operationKey: string, note: string | null = null): D1Statement[] {
  return [
    db.prepare("UPDATE lawyer_profiles SET plan_code = ?, plan_credit_balance = ?, reserve_credit_balance = ?, renewal_date = ?, subscription_status = ?, period_mode = ?, billing_version = billing_version + 1 WHERE user_id = ?").bind(after.planCode, after.planBalance, after.reserveBalance, after.renewalDate, after.subscriptionStatus, after.periodMode, userId),
    db.prepare("INSERT INTO credit_movements (id, lawyer_id, operation_key, operation, plan_delta, reserve_delta, plan_balance_after, reserve_balance_after, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), userId, operationKey, operation, after.planBalance - before.plan_credit_balance, after.reserveBalance - before.reserve_credit_balance, after.planBalance, after.reserveBalance, note),
  ];
}
export function nextRenewalDate(config: BillingConfig, now = Date.now()) { return new Date(now + config.periodDays * 86400000).toISOString(); }
export function checkWalletLimit(config: BillingConfig, planBalance: number, reserveBalance: number) {
  if (!integer(planBalance, 0, config.maxBalance) || !integer(reserveBalance, 0, config.maxBalance) || planBalance + reserveBalance > config.maxBalance) throw new BillingError("El saldo supera el límite configurado. Solicita una revisión administrativa.");
}

/** One current period only: absence never accumulates missed monthly allocations. */
export async function ensureCurrentBilling(db: D1Database, userId: string, now = Date.now()): Promise<BillingProfile> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [config, before] = await Promise.all([readBillingConfig(db), readBillingProfile(db, userId)]);
    if (before.application_status !== "approved" || before.user_status !== "active" || before.subscription_status === "cancelled") return before;
    const initializing = before.subscription_status === "none" && !before.renewal_date;
    const expired = before.renewal_date !== null && Date.parse(before.renewal_date) <= now;
    if (!initializing && !expired) return before;
    const plans = await readBillingPlans(db);
    const plan = plans.find((item) => item.code === before.plan_code);
    const reserveBalance = before.reserve_credit_balance + (config.rolloverOnRenewal ? before.plan_credit_balance : 0);
    const freeRenew = config.mode === "free" && Boolean(plan) && (initializing || config.freeAutoRenew) && reserveBalance + (plan?.monthly_credits || 0) <= config.maxBalance;
    // A PAID period cannot be invented through a client request or lazy renewal.
    const planBalance = freeRenew && plan ? plan.monthly_credits : 0;
    if (!freeRenew && before.subscription_status === "past_due" && before.plan_credit_balance === 0) return before;
    checkWalletLimit(config, planBalance, reserveBalance);
    const guard = crypto.randomUUID();
    const after: WalletChange = { planCode: before.plan_code, planBalance, reserveBalance, renewalDate: freeRenew ? nextRenewalDate(config, now) : before.renewal_date, subscriptionStatus: freeRenew ? "trial" : "past_due", periodMode: freeRenew ? "free" : before.period_mode };
    try {
      const operation = freeRenew ? initializing ? "activation" : "auto_renew" : config.mode === "paid" ? "paid_expiry" : "period_expiry";
      await db.batch([billingGuard(db, guard, userId, before.billing_version, config.version, true), ...walletStatements(db, userId, before, after, operation, `period:${before.billing_version}`, freeRenew ? "Asignación gratuita de un período, sin cobro." : "Sin renovación ni cobro: revisa habilitación, renovación automática y límite de saldo."), clearBillingGuard(db, guard)]);
      return await readBillingProfile(db, userId);
    } catch {
      const current = await readBillingProfile(db, userId);
      if (current.billing_version === before.billing_version && attempt === 1) throw new BillingError("No pudimos actualizar los créditos; vuelve a cargar el panel.");
    }
  }
  return readBillingProfile(db, userId);
}

export async function billingReplay(db: D1Database, userId: string, key: string, fingerprint: string) {
  const row = await db.prepare("SELECT request_fingerprint FROM billing_operations WHERE lawyer_id = ? AND idempotency_key = ?").bind(userId, key).first<{ request_fingerprint: string }>();
  if (!row) return false;
  if (row.request_fingerprint !== fingerprint) throw new BillingError("La clave de esta operación ya fue usada para otra solicitud.");
  return true;
}

export async function changeLawyerBilling(db: D1Database, userId: string, body: Record<string, unknown>): Promise<boolean> {
  if (!["select_plan", "renew", "cancel"].includes(String(body.action)) || !validBillingKey(body.idempotencyKey) || !integer(body.expectedVersion, 1, 2_000_000_000) || body.confirm !== true || (body.action === "select_plan" && !isPlanCode(body.planCode))) throw new BillingError("Confirma una operación, un plan y una versión válidos.", 400);
  const action = String(body.action), key = body.idempotencyKey;
  const fingerprint = JSON.stringify({ action, planCode: action === "select_plan" ? body.planCode : null, expectedVersion: body.expectedVersion });
  if (await billingReplay(db, userId, key, fingerprint)) return true;
  const [before, config, plans] = await Promise.all([readBillingProfile(db, userId), readBillingConfig(db), readBillingPlans(db)]);
  if (before.user_status !== "active" || before.application_status !== "approved") throw new BillingError("Tu perfil debe estar aprobado para administrar un plan.", 403);
  if (before.billing_version !== body.expectedVersion) throw new BillingError("El saldo cambió. Actualiza el panel antes de continuar.");
  if (action !== "cancel" && config.mode === "paid") throw new BillingError("Los pagos aún no están habilitados. No se realiza ningún cobro ni se asignan créditos pagados.", 503);
  const selectedCode = action === "select_plan" && isPlanCode(body.planCode) ? body.planCode : before.plan_code;
  const plan = plans.find((item) => item.code === selectedCode);
  if (action !== "cancel" && !plan) throw new BillingError("Este plan no está disponible.", 400);
  if (action === "renew" && before.subscription_status === "cancelled") throw new BillingError("Selecciona un plan antes de renovarlo.");
  if (action === "select_plan" && selectedCode === before.plan_code && ["active", "trial"].includes(before.subscription_status)) throw new BillingError("Ya tienes este plan. Usa renovar si necesitas iniciar un nuevo período.");
  if (action === "renew" && !config.allowEarlyRenewal && before.renewal_date && Date.parse(before.renewal_date) > Date.now()) throw new BillingError("La renovación anticipada está deshabilitada.");
  if (action === "cancel" && before.subscription_status === "cancelled") throw new BillingError("El plan ya está cancelado.");
  const rollover = action === "select_plan" ? config.rolloverOnChange : config.rolloverOnRenewal;
  const planBalance = action === "cancel" ? 0 : plan!.monthly_credits;
  const reserveBalance = before.reserve_credit_balance + (action !== "cancel" && rollover ? before.plan_credit_balance : 0);
  checkWalletLimit(config, planBalance, reserveBalance);
  const after: WalletChange = { planCode: selectedCode, planBalance, reserveBalance, renewalDate: action === "cancel" ? null : nextRenewalDate(config), subscriptionStatus: action === "cancel" ? "cancelled" : "trial", periodMode: "free" };
  const guard = crypto.randomUUID();
  try {
    await db.batch([billingGuard(db, guard, userId, before.billing_version, config.version, true), db.prepare("INSERT INTO billing_operations (lawyer_id, idempotency_key, request_fingerprint) VALUES (?, ?, ?)").bind(userId, key, fingerprint), ...walletStatements(db, userId, before, after, action, `request:${key}`, action === "cancel" ? "Cancelación: se eliminan créditos del plan; se conserva la reserva." : "Operación gratuita de prueba; sin cobro."), clearBillingGuard(db, guard)]);
  } catch {
    if (await billingReplay(db, userId, key, fingerprint)) return true;
    throw new BillingError("El saldo o la configuración cambió. Actualiza el panel y vuelve a intentarlo.");
  }
  return false;
}
