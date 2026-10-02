import { D1Database, requireUser, UserAuthEnv } from "../../_lib/user-auth";

interface Context { request: Request; env: UserAuthEnv & { DB?: D1Database }; }
type CaseRow = { id: string; category: string; title: string; description: string; region: string | null; status: string; created_at: string; attention_mode: string | null; commune: string | null; credit_cost: number; view_count: number; contact_accessed: number; preferred: number; contact_name: string | null; contact_email: string | null; contact_phone: string | null; contact_region: string | null; contact_commune: string | null; };

async function verifiedLawyer(request: Request, env: Context["env"]) {
  const session = await requireUser(request, env, "lawyer");
  if (!session || !env.DB) return { session, profile: null };
  const profile = await env.DB.prepare("SELECT lp.credit_balance, lp.application_status, u.status FROM lawyer_profiles lp JOIN users u ON u.id = lp.user_id WHERE lp.user_id = ? LIMIT 1").bind(session.id).first<{ credit_balance: number; application_status: string; status: string }>();
  return { session, profile };
}

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const { session, profile } = await verifiedLawyer(request, env);
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (profile?.application_status !== "approved" || profile.status !== "active") return Response.json({ cases: [], creditBalance: 0, verified: false }, { headers: { "Cache-Control": "no-store" } });
  const requested = new URL(request.url).searchParams.get("view") || "pool";
  const statement = requested === "accessed"
    ? env.DB.prepare("SELECT c.id, c.category, c.title, c.description, c.region, c.status, c.created_at, d.attention_mode, d.commune, c.credit_cost, COALESCE((SELECT COUNT(*) FROM case_views cv WHERE cv.case_id = c.id), 0) AS view_count, 1 AS contact_accessed, 0 AS preferred, json_extract(a.contact_snapshot_json, '$.fullName') AS contact_name, json_extract(a.contact_snapshot_json, '$.email') AS contact_email, json_extract(a.contact_snapshot_json, '$.phone') AS contact_phone, json_extract(a.contact_snapshot_json, '$.region') AS contact_region, json_extract(a.contact_snapshot_json, '$.commune') AS contact_commune FROM case_accesses a JOIN case_proposals p ON p.case_id = a.case_id AND p.lawyer_id = a.lawyer_id AND p.status = 'accepted' JOIN legal_cases c ON c.id = a.case_id LEFT JOIN case_details d ON d.case_id = c.id WHERE a.lawyer_id = ? ORDER BY a.accessed_at DESC")
    : env.DB.prepare("SELECT c.id, c.category, c.title, c.description, c.region, c.status, c.created_at, d.attention_mode, d.commune, c.credit_cost, COALESCE((SELECT COUNT(*) FROM case_views cv WHERE cv.case_id = c.id), 0) AS view_count, CASE WHEN a.case_id IS NULL THEN 0 ELSE 1 END AS contact_accessed, CASE WHEN instr(COALESCE(lp.specialties_json, '[]'), c.category) > 0 THEN 1 ELSE 0 END AS preferred, CASE WHEN a.case_id IS NULL THEN NULL ELSE json_extract(a.contact_snapshot_json, '$.fullName') END AS contact_name, CASE WHEN a.case_id IS NULL THEN NULL ELSE json_extract(a.contact_snapshot_json, '$.email') END AS contact_email, CASE WHEN a.case_id IS NULL THEN NULL ELSE json_extract(a.contact_snapshot_json, '$.phone') END AS contact_phone, CASE WHEN a.case_id IS NULL THEN NULL ELSE json_extract(a.contact_snapshot_json, '$.region') END AS contact_region, CASE WHEN a.case_id IS NULL THEN NULL ELSE json_extract(a.contact_snapshot_json, '$.commune') END AS contact_commune FROM legal_cases c LEFT JOIN case_details d ON d.case_id = c.id LEFT JOIN case_accesses a ON a.case_id = c.id AND a.lawyer_id = ? AND EXISTS (SELECT 1 FROM case_proposals p WHERE p.case_id = a.case_id AND p.lawyer_id = a.lawyer_id AND p.status = 'accepted') LEFT JOIN lawyer_profiles lp ON lp.user_id = ? WHERE c.status IN ('open', 'matched') ORDER BY preferred DESC, c.created_at DESC");
  const bound = requested === "accessed" ? statement.bind(session.id) : statement.bind(session.id, session.id);
  const rows = await bound.all<CaseRow>();
  const filtered = requested === "preferred" ? rows.results.filter((item) => item.preferred) : rows.results;
  if (profile?.application_status === "approved" && requested !== "accessed" && filtered.length) {
    await env.DB.batch(filtered.map((item) => env.DB!.prepare("INSERT OR IGNORE INTO case_views (case_id, viewer_id) VALUES (?, ?)").bind(item.id, session.id)));
  }
  return Response.json({ cases: filtered, creditBalance: profile?.credit_balance || 0, verified: profile?.application_status === "approved" });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const { session, profile } = await verifiedLawyer(request, env);
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (profile?.application_status !== "approved" || profile.status !== "active") return Response.json({ error: "Tu perfil debe estar aprobado antes de acceder a casos." }, { status: 403 });
  if (new URL(request.url).searchParams.get("action") !== "access") return Response.json({ error: "Acción no disponible." }, { status: 404 });
  const body = await request.json() as { caseId?: unknown };
  const caseId = typeof body.caseId === "string" ? body.caseId : "";
  if (!caseId) return Response.json({ error: "Caso inválido." }, { status: 400 });
  const legalCase = await env.DB.prepare("SELECT c.id, c.credit_cost, u.full_name, u.email, u.phone, u.region, u.commune FROM legal_cases c JOIN users u ON u.id = c.person_id JOIN case_proposals p ON p.case_id = c.id AND p.lawyer_id = ? AND p.status = 'accepted' WHERE c.id = ? AND c.status = 'matched' LIMIT 1").bind(session.id, caseId).first<{ id: string; credit_cost: number; full_name: string; email: string; phone: string | null; region: string | null; commune: string | null }>();
  if (!legalCase) return Response.json({ error: "Solo puedes ver el contacto cuando el cliente acepta tu propuesta." }, { status: 403 });
  const existing = await env.DB.prepare("SELECT contact_snapshot_json FROM case_accesses WHERE case_id = ? AND lawyer_id = ? LIMIT 1").bind(caseId, session.id).first<{ contact_snapshot_json: string }>();
  if (existing) return Response.json({ alreadyAccessed: true, contact: JSON.parse(existing.contact_snapshot_json), creditBalance: profile.credit_balance });
  if (profile.credit_balance < legalCase.credit_cost) return Response.json({ error: `Necesitas ${legalCase.credit_cost} créditos y tienes ${profile.credit_balance}.` }, { status: 409 });
  const contact = { fullName: legalCase.full_name, email: legalCase.email, phone: legalCase.phone, region: legalCase.region, commune: legalCase.commune };
  try {
    await env.DB.prepare("INSERT INTO case_accesses (case_id, lawyer_id, credits_spent, contact_snapshot_json) VALUES (?, ?, ?, ?)").bind(caseId, session.id, legalCase.credit_cost, JSON.stringify(contact)).run();
    const updated = await env.DB.prepare("SELECT credit_balance FROM lawyer_profiles WHERE user_id = ? LIMIT 1").bind(session.id).first<{ credit_balance: number }>();
    return Response.json({ accessed: true, contact, creditBalance: updated?.credit_balance || 0 });
  } catch {
    return Response.json({ error: "No pudimos desbloquear el caso. Actualiza la página e intenta nuevamente." }, { status: 409 });
  }
};
