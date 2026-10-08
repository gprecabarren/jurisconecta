import { adminGitHubLogin, authSettings, readSession, type AuthEnv } from "../../_lib/github-auth";
import { adminAuditStatement } from "../../_lib/admin-audit";
import type { D1Database } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }

async function authorized(request: Request, env: Context["env"]) {
  const session = await readSession(request, env);
  const { allowedLogin = adminGitHubLogin } = authSettings(env);
  return Boolean(session && session.login.toLowerCase() === allowedLogin.toLowerCase());
}

export const onRequestGet = async ({ request, env }: Context) => {
  if (!await authorized(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible" }, { status: 503 });
  const settings = await env.DB.prepare("SELECT maintenance_enabled, gtm_id, ga_measurement_id, updated_at FROM site_settings WHERE id = 1").first<{ maintenance_enabled: number; gtm_id: string; ga_measurement_id: string; updated_at: string }>();
  return Response.json({ maintenanceEnabled: settings?.maintenance_enabled === 1, gtmId: settings?.gtm_id || "", gaMeasurementId: settings?.ga_measurement_id || "", updatedAt: settings?.updated_at ?? null });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!await authorized(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible" }, { status: 503 });
  const payload = await readJsonBody(request);
  if (!payload || (payload.maintenanceEnabled !== undefined && typeof payload.maintenanceEnabled !== "boolean")) return Response.json({ error: "Configuración inválida." }, { status: 400 });
  const current = await env.DB.prepare("SELECT maintenance_enabled, gtm_id, ga_measurement_id FROM site_settings WHERE id = 1").first<{ maintenance_enabled: number; gtm_id: string; ga_measurement_id: string }>();
  if (!current) return Response.json({ error: "Configuración no inicializada" }, { status: 503 });
  const enabled = payload.maintenanceEnabled === undefined ? current.maintenance_enabled === 1 : payload.maintenanceEnabled === true;
  const gtmId = payload.gtmId === undefined ? current.gtm_id : typeof payload.gtmId === "string" ? payload.gtmId.trim() : "invalid";
  const gaId = payload.gaMeasurementId === undefined ? current.ga_measurement_id : typeof payload.gaMeasurementId === "string" ? payload.gaMeasurementId.trim() : "invalid";
  if ((gtmId && !/^GTM-[A-Z0-9]{4,12}$/.test(gtmId)) || (gaId && !/^G-[A-Z0-9]{6,15}$/.test(gaId))) return Response.json({ error: "Revisa los identificadores GTM-… y G-…" }, { status: 400 });
  if ((current.maintenance_enabled === 1) !== enabled || current.gtm_id !== gtmId || current.ga_measurement_id !== gaId) {
    await env.DB.batch([
      env.DB.prepare("UPDATE site_settings SET maintenance_enabled = ?, gtm_id = ?, ga_measurement_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(enabled ? 1 : 0, gtmId, gaId),
      await adminAuditStatement(request, env, env.DB, payload.maintenanceEnabled !== undefined ? enabled ? "maintenance.enable" : "maintenance.disable" : "measurement.update", "site_settings", "1", { previous: current.maintenance_enabled === 1, enabled, gtmId, gaId }),
    ]);
  }
  return Response.json({ maintenanceEnabled: enabled, gtmId, gaMeasurementId: gaId });
};
