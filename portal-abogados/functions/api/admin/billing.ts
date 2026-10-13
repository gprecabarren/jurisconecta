import { readSession, type AuthEnv } from "../../_lib/github-auth";
import { adminAuditStatement } from "../../_lib/admin-audit";
import { readJsonBody } from "../../_lib/http";
import { BillingError, billingGuard, billingReplay, checkWalletLimit, clearBillingGuard, integer, parseBillingUpdate, readBillingConfig, readBillingPlans, readBillingProfile, readCreditLedger, validBillingKey, walletStatements } from "../../_lib/billing";
import type { AdminBillingResponse } from "../../../shared/billing";
interface Context { request: Request; env: AuthEnv; }
function failed(error: unknown) { if (error instanceof BillingError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } }); throw error; }

export const onRequestGet = async ({ request, env }: Context) => {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  try {
    const [config, plans] = await Promise.all([readBillingConfig(env.DB), readBillingPlans(env.DB, true)]);
    const data: AdminBillingResponse = { config, plans, canManage: admin.role === "owner", paymentsEnabled: false };
    const userId = new URL(request.url).searchParams.get("userId");
    if (userId) {
      if (userId.length > 100) return Response.json({ error: "Cuenta inválida." }, { status: 400 });
      const user = await env.DB.prepare("SELECT full_name, email FROM users WHERE id = ? AND role = 'lawyer'").bind(userId).first<{ full_name: string; email: string }>();
      if (!user) return Response.json({ error: "No encontramos esa cuenta de abogado." }, { status: 404 });
      // Inspection does not grant or renew credits; it is strictly read-only.
      data.target = { userId, fullName: user.full_name, email: user.email, profile: await readBillingProfile(env.DB, userId), ledger: await readCreditLedger(env.DB, userId) };
    }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failed(error); }
};

export const onRequestPatch = async ({ request, env }: Context) => {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (admin.role !== "owner") return Response.json({ error: "Solo el propietario puede editar parámetros económicos." }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request, 16384);
  const update = body && parseBillingUpdate(body);
  if (!update) return Response.json({ error: "Revisa valores, beneficios, planes, límites y versión. La reserva debe conservarse al cancelar." }, { status: 400 });
  try {
    const before = await readBillingConfig(env.DB);
    if (before.version !== update.expectedVersion) throw new BillingError("La configuración cambió. Vuelve a cargarla.");
    if (before.mode !== update.config.mode && !update.confirmModeChange) throw new BillingError("Confirma explícitamente el cambio de modo.", 400);
    const { config } = update;
    const guard = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO billing_transaction_guards (id, valid) SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM billing_config WHERE id = 1 AND version = ?) AND NOT EXISTS (SELECT 1 FROM lawyer_profiles WHERE credit_balance > ?) THEN 1 ELSE 0 END").bind(guard, before.version, config.maxBalance),
        env.DB.prepare("UPDATE billing_config SET version = version + 1, mode = ?, period_days = ?, default_case_credit_cost = ?, rollover_on_renewal = ?, rollover_on_change = ?, preserve_reserve_on_cancel = 1, free_auto_renew = ?, allow_early_renewal = ?, max_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(config.mode, config.periodDays, config.defaultCaseCreditCost, Number(config.rolloverOnRenewal), Number(config.rolloverOnChange), Number(config.freeAutoRenew), Number(config.allowEarlyRenewal), config.maxBalance),
        ...update.plans.map((plan) => env.DB!.prepare("UPDATE subscription_plans SET name = ?, monthly_credits = ?, monthly_price_clp = ?, monthly_price_uf_hundredths = ?, extra_credit_price_clp = ?, description = ?, benefits_json = ?, sort_order = ?, active = ?, featured = ? WHERE code = ?").bind(plan.name, plan.monthly_credits, plan.monthly_price_clp, Math.round(plan.monthly_price_uf * 100), plan.extra_credit_price_clp, plan.description, JSON.stringify(plan.benefits), plan.sort_order, Number(plan.active), Number(plan.featured), plan.code)),
        await adminAuditStatement(request, env, env.DB, "billing.configure", "billing", "1", { previousVersion: before.version, nextVersion: before.version + 1, previousMode: before.mode, mode: config.mode, config, plans: update.plans }),
        clearBillingGuard(env.DB, guard),
      ]);
    } catch { throw new BillingError("No se guardó: otra edición cambió la configuración, los nombres colisionan o el límite es menor que un saldo existente."); }
    return onRequestGet({ request, env });
  } catch (error) { return failed(error); }
};

export const onRequestPost = async ({ request, env }: Context) => {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (admin.role !== "owner") return Response.json({ error: "Solo el propietario puede ajustar créditos." }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request, 4096);
  if (!body || body.action !== "adjust_reserve" || typeof body.userId !== "string" || !body.userId || body.userId.length > 100 || !integer(body.delta, -100000, 100000) || body.delta === 0 || typeof body.note !== "string" || body.note.trim().length < 10 || body.note.length > 500 || !integer(body.expectedVersion, 1, 2_000_000_000) || !validBillingKey(body.idempotencyKey) || body.confirm !== true) return Response.json({ error: "Confirma una cuenta, ajuste no nulo, motivo y versión válidos." }, { status: 400 });
  const { userId, delta, idempotencyKey, expectedVersion } = body;
  const note = body.note.trim();
  const fingerprint = JSON.stringify({ action: "adjust_reserve", actor: admin.githubId, delta, note, expectedVersion });
  try {
    let replayed = await billingReplay(env.DB, userId, idempotencyKey, fingerprint);
    if (!replayed) {
      const [config, before] = await Promise.all([readBillingConfig(env.DB), readBillingProfile(env.DB, userId)]);
      if (before.billing_version !== expectedVersion) throw new BillingError("El saldo cambió. Vuelve a consultar la cuenta.");
      const reserveBalance = before.reserve_credit_balance + delta;
      checkWalletLimit(config, before.plan_credit_balance, reserveBalance);
      const guard = crypto.randomUUID();
      try {
        await env.DB.batch([
          billingGuard(env.DB, guard, userId, before.billing_version, config.version),
          env.DB.prepare("INSERT INTO billing_operations (lawyer_id, idempotency_key, request_fingerprint) VALUES (?, ?, ?)").bind(userId, idempotencyKey, fingerprint),
          ...walletStatements(env.DB, userId, before, { planCode: before.plan_code, planBalance: before.plan_credit_balance, reserveBalance, renewalDate: before.renewal_date, subscriptionStatus: before.subscription_status, periodMode: before.period_mode }, "manual_adjustment", `request:${idempotencyKey}`, note),
          await adminAuditStatement(request, env, env.DB, "billing.adjust_reserve", "user", userId, { delta, note, previousVersion: before.billing_version, nextVersion: before.billing_version + 1 }),
          clearBillingGuard(env.DB, guard),
        ]);
      } catch {
        replayed = await billingReplay(env.DB, userId, idempotencyKey, fingerprint);
        if (!replayed) throw new BillingError("El saldo o la configuración cambió. El ajuste no se aplicó.");
      }
    }
    const lookup = new Request(new URL(`/api/admin/billing?userId=${encodeURIComponent(userId)}`, request.url), { headers: request.headers });
    const response = await onRequestGet({ request: lookup, env });
    const data: unknown = await response.json();
    return Response.json({ ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}), replayed }, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failed(error); }
};
