import assert from "node:assert/strict";
import test from "node:test";
import { CASE_TYPE_SEED } from "../shared/case-intake-seed";
import { caseIntakeLimits, parseCaseType, type CaseType } from "../shared/case-intake";
import { CASE_CATALOG_SUMMARIES, summarizeCaseType } from "../shared/case-catalog-summary";
import { defaultCaseSearchKeywords, normalizeCaseSearchKeyword } from "../shared/case-search-keywords";
import { readCaseType, readCaseTypes } from "../functions/_lib/case-types";
import { createSession } from "../functions/_lib/github-auth";
import { onRequestGet as publicGet } from "../functions/api/case-types";
import { onRequestPatch as adminPatch, onRequestPost as adminPost } from "../functions/api/admin/case-types";
import { TestDb } from "./test-db";

function environment() { return { DB: new TestDb(), AUTH_SESSION_SECRET: "case-keyword-tests-only-not-for-production" }; }
function request(method = "GET", body?: unknown, cookie = "", origin = "https://jurisconecta.cl") {
  return new Request("https://jurisconecta.cl/api/admin/case-types", { method, headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function cookie(env: ReturnType<typeof environment>) { return `juris_admin=${await createSession("gprecabarren", env, request())}`; }
function fixture() { return structuredClone(CASE_TYPE_SEED[0]); }
async function stored(env: ReturnType<typeof environment>, type: CaseType) {
  await env.DB.prepare("INSERT INTO case_type_catalog (id, schema_json, version, enabled, sort_order, updated_by) VALUES (?, ?, ?, ?, ?, 'fixture')").bind(type.id, JSON.stringify(type), type.version, Number(type.enabled), type.sortOrder).run();
}

test("all 78 local fallbacks have bounded everyday aliases, independent copies and shared public summaries", () => {
  assert.equal(CASE_TYPE_SEED.length, 78);
  assert.deepEqual(CASE_CATALOG_SUMMARIES, CASE_TYPE_SEED.map(summarizeCaseType));
  for (const type of CASE_TYPE_SEED) {
    assert.ok(type.searchKeywords && type.searchKeywords.length >= 3, type.id);
    assert.equal(parseCaseType(type).ok, true, type.id);
    assert.deepEqual(type.searchKeywords, defaultCaseSearchKeywords(type.id), type.id);
    assert.ok(type.searchKeywords.length <= caseIntakeLimits.searchKeywords);
    assert.equal(new Set(type.searchKeywords.map(normalizeCaseSearchKeyword)).size, type.searchKeywords.length, type.id);
  }
  assert.ok(defaultCaseSearchKeywords("violencia-intrafamiliar").includes("golpes"));
  assert.ok(defaultCaseSearchKeywords("agresiones-y-rinas").includes("golpes"));
  for (const customId of ["constructor", "toString", "__proto__", "tipo-nuevo"]) assert.deepEqual(defaultCaseSearchKeywords(customId), []);
  const copy = defaultCaseSearchKeywords("violencia-intrafamiliar"); copy.push("local mutation");
  assert.equal(defaultCaseSearchKeywords("violencia-intrafamiliar").includes("local mutation"), false);
  assert.deepEqual(defaultCaseSearchKeywords("custom-case-without-defaults"), []);
});

test("keywords are optional, trimmed, space-compacted and deduplicated ignoring accents and case", () => {
  const type = fixture(); delete type.searchKeywords;
  const legacy = parseCaseType(type); assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal("searchKeywords" in legacy.type, false);
  const result = parseCaseType({ ...type, searchKeywords: ["  Pensión   de alimentos  ", "pension de ALIMENTOS", "GOLPES", "golpes", "violencia doméstica"] });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.type.searchKeywords, ["Pensión de alimentos", "GOLPES", "violencia doméstica"]);
  const empty = parseCaseType({ ...type, searchKeywords: [] });
  assert.equal(empty.ok, true); if (empty.ok) assert.deepEqual(empty.type.searchKeywords, []);
});

test("keyword validation rejects unbounded, malformed, HTML, controls and invisible-direction text", () => {
  const type = fixture();
  for (const searchKeywords of [null, "golpes", {}, [5], [""], ["   "], ["<img src=x>"], ["a\nb"], ["a\tb"], ["a\u0000b"], ["a\u007fb"], ["a\u0085b"], ["a\u202eb"], ["a\u200bb"], ["a".repeat(65)], Array.from({ length: 33 }, (_, i) => `término ${i}`), Array.from({ length: 26 }, (_, i) => `${i}`.padEnd(64, "a"))]) {
    const parsed = parseCaseType({ ...type, searchKeywords });
    assert.equal(parsed.ok, false, JSON.stringify(searchKeywords));
    if (!parsed.ok) assert.ok(parsed.issues.some((issue) => issue.field.startsWith("searchKeywords")));
  }
  assert.equal(parseCaseType({ ...type, searchKeywords: Array.from({ length: 25 }, (_, i) => `${i}`.padEnd(64, "a")) }).ok, true);
});

test("legacy schemas inherit only keyword defaults without replacing customized questions or metadata", async () => {
  const env = environment(), type = fixture();
  delete type.searchKeywords;
  type.topic = "Formulario de alimentos personalizado";
  type.steps = [{ id: "propio", title: "Paso propio", description: "Texto editorial guardado", questions: [{ id: "pregunta-propia", label: "Pregunta propia guardada", type: "text", required: false }] }];
  await stored(env, type);
  const read = await readCaseType(env.DB, type.id);
  assert.deepEqual(read?.searchKeywords, defaultCaseSearchKeywords(type.id));
  assert.deepEqual(read?.steps, type.steps); assert.deepEqual(read?.guidance, type.guidance);
  assert.equal(read?.topic, type.topic); assert.equal(read?.version, type.version);
  const raw = await env.DB.prepare("SELECT schema_json FROM case_type_catalog WHERE id = ?").bind(type.id).first<{ schema_json: string }>();
  assert.equal("searchKeywords" in JSON.parse(raw!.schema_json), false, "reading must not rewrite stored forms");
});

test("saved aliases, explicit empty arrays and old-editor writes preserve intent with CAS and audit", async () => {
  const env = environment(), auth = await cookie(env), type = fixture();
  const aliases = ["  Caso   cotidiano  ", "cáso cotidiano", "Otras palabras"];
  const savedResponse = await adminPatch({ request: request("PATCH", { type: { ...type, searchKeywords: aliases }, expectedVersion: 1 }, auth), env });
  assert.equal(savedResponse.status, 200);
  const saved = await readCaseType(env.DB, type.id);
  assert.deepEqual(saved?.searchKeywords, ["Caso cotidiano", "Otras palabras"]); assert.equal(saved?.version, 2);
  const oldEditor = { ...saved!, topic: "Formulario editado desde cliente antiguo" }; delete oldEditor.searchKeywords;
  assert.equal((await adminPatch({ request: request("PATCH", { type: oldEditor, expectedVersion: 2 }, auth), env })).status, 200);
  const preserved = await readCaseType(env.DB, type.id);
  assert.deepEqual(preserved?.searchKeywords, saved?.searchKeywords); assert.equal(preserved?.version, 3);
  const clearedResponse = await adminPatch({ request: request("PATCH", { type: { ...preserved!, searchKeywords: [] }, expectedVersion: 3 }, auth), env });
  assert.equal(clearedResponse.status, 200);
  const cleared = await readCaseType(env.DB, type.id);
  assert.deepEqual(cleared?.searchKeywords, []); assert.equal(cleared?.version, 4);
  const oldEditorAfterClear = { ...cleared!, description: "Una descripción segura guardada desde un editor antiguo." }; delete oldEditorAfterClear.searchKeywords;
  assert.equal((await adminPatch({ request: request("PATCH", { type: oldEditorAfterClear, expectedVersion: 4 }, auth), env })).status, 200);
  assert.deepEqual((await readCaseType(env.DB, type.id))?.searchKeywords, []);
  assert.equal((await adminPatch({ request: request("PATCH", { type: { ...type, searchKeywords: ["stale overwrite"] }, expectedVersion: 1 }, auth), env })).status, 409);
  assert.deepEqual((await readCaseType(env.DB, type.id))?.searchKeywords, []);
  const audits = await env.DB.prepare("SELECT github_login, details_json FROM admin_audit_log WHERE target_id = ? ORDER BY rowid").bind(type.id).all<{ github_login: string; details_json: string }>();
  assert.equal(audits.results.length, 4);
  assert.ok(audits.results.every((audit) => audit.github_login === "gprecabarren"));
  const last = JSON.parse(audits.results.at(-1)!.details_json) as { previous: CaseType; next: CaseType };
  assert.deepEqual(last.previous.searchKeywords, []); assert.deepEqual(last.next.searchKeywords, []);
  assert.equal(last.previous.version, 4); assert.equal(last.next.version, 5);
});

test("public summaries include saved aliases, omit forms and guidance and never expose archived types", async () => {
  const env = environment(), type = fixture(); type.searchKeywords = ["Alias público propio"];
  await stored(env, type);
  const hidden = structuredClone(CASE_TYPE_SEED[1]); hidden.enabled = false; hidden.searchKeywords = ["Alias reservado de tipo oculto"]; await stored(env, hidden);
  const response = await publicGet({ request: new Request("https://jurisconecta.cl/api/case-types?view=summary"), env });
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  const { types } = await response.json() as { types: Array<Record<string, unknown>> };
  assert.deepEqual(types.find((item) => item.id === type.id)?.searchKeywords, type.searchKeywords);
  assert.equal(types.some((item) => item.id === hidden.id), false);
  assert.equal(types.some((item) => "steps" in item || "guidance" in item || "description" in item), false);
  assert.equal(JSON.stringify(types).includes("Alias reservado"), false);
  assert.equal((await readCaseTypes(env.DB, true)).some((item) => item.id === hidden.id), true);
  type.searchKeywords = [];
  assert.deepEqual(summarizeCaseType(type).searchKeywords, [], "summary must not restore explicitly removed defaults");
});

test("keyword mutation still requires an administrator, same origin and valid content", async () => {
  const env = environment(), auth = await cookie(env), type = fixture();
  assert.equal((await adminPatch({ request: request("PATCH", { type, expectedVersion: 1 }), env })).status, 401);
  assert.equal((await adminPatch({ request: request("PATCH", { type, expectedVersion: 1 }, auth, "https://attacker.example"), env })).status, 403);
  assert.equal((await adminPatch({ request: request("PATCH", { type: { ...type, searchKeywords: ["<script>bad</script>"] }, expectedVersion: 1 }, auth), env })).status, 400);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log").first<{ n: number }>())?.n, 0);
  assert.equal((await readCaseType(env.DB, type.id))?.version, 1);
  const newType = { ...type, id: "custom-keyword-fixture", topic: "Caso personalizado de prueba", searchKeywords: ["mi búsqueda"] };
  assert.equal((await adminPost({ request: request("POST", { type: newType }, auth), env })).status, 201);
  assert.deepEqual((await readCaseType(env.DB, newType.id))?.searchKeywords, ["mi búsqueda"]);
});
