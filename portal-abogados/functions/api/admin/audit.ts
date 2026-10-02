import { isAdmin } from "../../_lib/admin-auth";
import type { AuthEnv } from "../../_lib/github-auth";
export const onRequestGet = async ({ request, env }: { request: Request; env: AuthEnv }) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const offset = Math.min(Math.max(Number(new URL(request.url).searchParams.get("offset")) || 0, 0), 10_000);
  const rows = await env.DB.prepare("SELECT id, github_login, action, target_type, target_id, details_json, created_at FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT 100 OFFSET ?").bind(offset).all();
  return Response.json({ entries: rows.results, offset, nextOffset: rows.results.length === 100 ? offset + 100 : null }, { headers: { "Cache-Control": "no-store" } });
};
