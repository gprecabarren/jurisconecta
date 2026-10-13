import { requireUser, type UserAuthEnv } from "../../_lib/user-auth";
import { BillingError, changeLawyerBilling, ensureCurrentBilling, readBillingConfig, readBillingPlans, readCreditLedger } from "../../_lib/billing";
import { readJsonBody } from "../../_lib/http";

interface Context { request: Request; env: UserAuthEnv; }
function failed(error: unknown) { if (error instanceof BillingError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } }); throw error; }

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const profile = await ensureCurrentBilling(env.DB, session.id);
    const [plans, config, ledger] = await Promise.all([readBillingPlans(env.DB), readBillingConfig(env.DB), readCreditLedger(env.DB, session.id)]);
    return Response.json({ plans, config, profile, ledger, paymentsEnabled: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failed(error); }
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const body = await readJsonBody(request, 4096);
  if (!body) return Response.json({ error: "Solicitud inválida o demasiado grande." }, { status: 400 });
  try {
    const replayed = await changeLawyerBilling(env.DB, session.id, body);
    // Deliberately do not perform lazy renewal before an action: explicit versioning
    // refers to the exact wallet shown to the lawyer, and cancellation must work at expiry.
    const response = await onRequestGet({ request, env });
    const data: unknown = await response.json();
    return Response.json({ ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}), replayed }, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failed(error); }
};
