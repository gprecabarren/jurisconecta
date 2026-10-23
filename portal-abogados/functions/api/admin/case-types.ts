import { adminAuditStatement } from "../../_lib/admin-audit";
import { CaseTypeError, readCaseType, readCaseTypes } from "../../_lib/case-types";
import { readSession, type AuthEnv } from "../../_lib/github-auth";
import { readJsonBody } from "../../_lib/http";
import { caseIntakeLimits, parseCaseType } from "../../../shared/case-intake";
import { CASE_TYPE_SEED } from "../../../shared/case-intake-seed";
import { defaultCaseSearchKeywords } from "../../../shared/case-search-keywords";
interface Context { request: Request; env: AuthEnv }
const headers = { "Cache-Control": "no-store" };
function failed(error: unknown): Response { if (error instanceof CaseTypeError) return Response.json({ error: error.message }, { status: error.status, headers }); throw error; }
export const onRequestGet = async ({ request, env }: Context) => {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401, headers });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503, headers });
  try { return Response.json({ types: await readCaseTypes(env.DB, true), canManage: true }, { headers }); } catch (error) { return failed(error); }
};
async function save({ request, env }: Context, create: boolean): Promise<Response> {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401, headers });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503, headers });
  const origin = request.headers.get("Origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") return Response.json({ error: "Origen no permitido." }, { status: 403, headers });
  const body = await readJsonBody(request, 28_000), parsed = parseCaseType(body?.type);
  if (!parsed.ok) return Response.json({ error: "Revisa las preguntas y los límites del formulario.", issues: parsed.issues }, { status: 400, headers });
  const type = parsed.type, expectedVersion = body?.expectedVersion;
  if (!create && (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion !== type.version)) return Response.json({ error: "Indica la versión actual del formulario." }, { status: 400, headers });
  try {
    const before = await readCaseType(env.DB, type.id);
    if (create && before) throw new CaseTypeError("Ese identificador ya existe. Edita el tipo existente para conservar su historial.");
    if (!create && (!before || before.version !== expectedVersion)) throw new CaseTypeError("El formulario cambió. Recarga antes de guardar.");
    // Older editors omit this optional field: never erase an administrator's saved aliases.
    // An explicit empty array is intentional and must not bring the defaults back.
    const searchKeywords = type.searchKeywords ?? before?.searchKeywords ?? defaultCaseSearchKeywords(type.id);
    const finalType = { ...type, searchKeywords, version: create ? 1 : Number(expectedVersion) + 1 }, guard = crypto.randomUUID();
    // Count the union of immutable baseline IDs and DB additions inside the same atomic batch.
    const baselineIds = CASE_TYPE_SEED.map((item) => item.id), placeholders = baselineIds.map(() => "?").join(",");
    const countSql = `(SELECT COUNT(*) FROM case_type_catalog WHERE id NOT IN (${placeholders})) + ?`;
    const baseline = CASE_TYPE_SEED.some((item) => item.id === type.id);
    const versionSql = create ? "NOT EXISTS (SELECT 1 FROM case_type_catalog WHERE id = ?)" : "COALESCE((SELECT version FROM case_type_catalog WHERE id = ?), ?) = ?";
    const versionValues = create ? [type.id] : [type.id, baseline ? 1 : -1, expectedVersion];
    const needsNewSlot = create ? 1 : 0;
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO case_type_transaction_guards (id, valid) SELECT ?, CASE WHEN ${versionSql} AND ${countSql} + ? <= ? THEN 1 ELSE 0 END`).bind(guard, ...versionValues, ...baselineIds, baselineIds.length, needsNewSlot, caseIntakeLimits.types),
        env.DB.prepare("INSERT INTO case_type_catalog (id, schema_json, version, enabled, sort_order, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET schema_json = excluded.schema_json, version = excluded.version, enabled = excluded.enabled, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by").bind(finalType.id, JSON.stringify(finalType), finalType.version, Number(finalType.enabled), finalType.sortOrder, admin.login),
        await adminAuditStatement(request, env, env.DB, create ? "case_types.create" : before?.enabled && !finalType.enabled ? "case_types.archive" : "case_types.update", "case_type", finalType.id, { previousVersion: before?.version ?? null, version: finalType.version, previous: before, next: finalType }),
        env.DB.prepare("DELETE FROM case_type_transaction_guards WHERE id = ?").bind(guard),
      ]);
    } catch { throw new CaseTypeError("No se guardó: otra edición cambió el formulario o se alcanzó el límite de 120 tipos."); }
    return Response.json({ type: finalType }, { status: create ? 201 : 200, headers });
  } catch (error) { return failed(error); }
}
export const onRequestPost = (context: Context) => save(context, true);
export const onRequestPatch = (context: Context) => save(context, false);
