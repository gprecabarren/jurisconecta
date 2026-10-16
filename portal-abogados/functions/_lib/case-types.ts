import { CASE_TYPE_SEED } from "../../shared/case-intake-seed";
import { parseCaseType, type CaseType } from "../../shared/case-intake";
import type { D1Database } from "./user-auth";

export { validateIntakeAnswers } from "../../shared/case-intake";
export class CaseTypeError extends Error { constructor(message: string, public status = 409) { super(message); } }
type CatalogRow = { id: string; schema_json: string; version: number; enabled: number; sort_order: number };
function fromRow(row: CatalogRow): CaseType {
  let value: unknown;
  try { value = JSON.parse(row.schema_json); } catch { throw new CaseTypeError("El formulario guardado no es válido. Revisa su configuración.", 503); }
  const parsed = parseCaseType(value);
  if (!parsed.ok || parsed.type.id !== row.id) throw new CaseTypeError("El formulario guardado no es válido. Revisa su configuración.", 503);
  return { ...parsed.type, version: row.version, enabled: row.enabled === 1, sortOrder: row.sort_order };
}
export async function readCaseTypes(db: D1Database, includeDisabled = false): Promise<CaseType[]> {
  const rows = await db.prepare("SELECT id, schema_json, version, enabled, sort_order FROM case_type_catalog ORDER BY sort_order, id LIMIT 121").all<CatalogRow>();
  const merged = new Map(CASE_TYPE_SEED.map((type) => [type.id, structuredClone(type)]));
  for (const row of rows.results) merged.set(row.id, fromRow(row));
  return [...merged.values()].filter((type) => includeDisabled || type.enabled).sort((a, b) => a.sortOrder - b.sortOrder || a.topic.localeCompare(b.topic, "es"));
}
/** Includes disabled definitions for historical drafts; callers must check enabled before publishing. */
export async function readCaseType(db: D1Database, id: string): Promise<CaseType | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) return null;
  const row = await db.prepare("SELECT id, schema_json, version, enabled, sort_order FROM case_type_catalog WHERE id = ?").bind(id).first<CatalogRow>();
  if (row) return fromRow(row);
  const baseline = CASE_TYPE_SEED.find((type) => type.id === id);
  return baseline ? structuredClone(baseline) : null;
}
