import { isAdmin } from "../../_lib/admin-auth";
import type { AuthEnv } from "../../_lib/github-auth";
import type { D1Database } from "../../_lib/user-auth";
import { adminAuditStatement } from "../../_lib/admin-audit";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }
type AdminCase = { id: string; category: string; title: string; status: string; credit_cost: number; created_at: string; person_name: string; person_email: string; region: string | null; commune: string | null; access_count: number; view_count: number; };

export const onRequestGet = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const cases = await env.DB.prepare("SELECT c.id, c.category, c.title, c.status, c.credit_cost, c.created_at, u.full_name AS person_name, u.email AS person_email, c.region, d.commune, COUNT(a.lawyer_id) AS access_count, COALESCE((SELECT COUNT(*) FROM case_views cv WHERE cv.case_id = c.id), 0) AS view_count FROM legal_cases c JOIN users u ON u.id = c.person_id LEFT JOIN case_details d ON d.case_id = c.id LEFT JOIN case_accesses a ON a.case_id = c.id GROUP BY c.id ORDER BY c.created_at DESC").all<AdminCase>();
  return Response.json({ cases: cases.results });
};

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const payload = await request.json() as { id?: unknown; creditCost?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  const cost = Number(payload.creditCost);
  if (!id || !Number.isInteger(cost) || cost < 0 || cost > 1000) return Response.json({ error: "Indica un valor entre 0 y 1.000 créditos." }, { status: 400 });
  const existing = await env.DB.prepare("SELECT credit_cost FROM legal_cases WHERE id = ? LIMIT 1").bind(id).first<{ credit_cost: number }>();
  if (!existing) return Response.json({ error: "No encontramos ese caso." }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare("UPDATE legal_cases SET credit_cost = ?, credit_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(cost, id),
    await adminAuditStatement(request, env, env.DB, "case.credit_cost", "case", id, { previous: existing.credit_cost, next: cost }),
  ]);
  return Response.json({ saved: true, creditCost: cost });
};
