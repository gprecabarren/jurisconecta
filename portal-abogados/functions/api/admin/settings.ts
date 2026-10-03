import { adminGitHubLogin, authSettings, readSession, type AuthEnv } from "../../_lib/github-auth";
import { adminAuditStatement } from "../../_lib/admin-audit";
import type { D1Database } from "../../_lib/user-auth";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }

async function authorized(request: Request, env: Context["env"]) {
  const session = await readSession(request, env);
  const { allowedLogin = adminGitHubLogin } = authSettings(env);
  return Boolean(session && session.login.toLowerCase() === allowedLogin.toLowerCase());
}

export const onRequestGet = async ({ request, env }: Context) => {
  if (!await authorized(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible" }, { status: 503 });
  const settings = await env.DB.prepare("SELECT maintenance_enabled, updated_at FROM site_settings WHERE id = 1").first<{ maintenance_enabled: number; updated_at: string }>();
  return Response.json({ maintenanceEnabled: settings?.maintenance_enabled === 1, updatedAt: settings?.updated_at ?? null });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!await authorized(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible" }, { status: 503 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || typeof (payload as { maintenanceEnabled?: unknown }).maintenanceEnabled !== "boolean") return Response.json({ error: "Indica un estado válido para mantenimiento." }, { status: 400 });
  const enabled = (payload as { maintenanceEnabled: boolean }).maintenanceEnabled;
  const current = await env.DB.prepare("SELECT maintenance_enabled FROM site_settings WHERE id = 1").first<{ maintenance_enabled: number }>();
  if (!current) return Response.json({ error: "Configuración no inicializada" }, { status: 503 });
  if ((current.maintenance_enabled === 1) !== enabled) {
    await env.DB.batch([
      env.DB.prepare("UPDATE site_settings SET maintenance_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(enabled ? 1 : 0),
      await adminAuditStatement(request, env, env.DB, enabled ? "maintenance.enable" : "maintenance.disable", "site_settings", "1", { previous: current.maintenance_enabled === 1, enabled }),
    ]);
  }
  return Response.json({ maintenanceEnabled: enabled });
};
