import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { CASE_TYPE_SEED } from "../shared/case-intake-seed";
import { caseIntakeLimits, parseCaseType, validateIntakeAnswers, type CaseType } from "../shared/case-intake";
import { readCaseType, readCaseTypes } from "../functions/_lib/case-types";
import { createSession } from "../functions/_lib/github-auth";
import { onRequestGet as publicGet } from "../functions/api/case-types";
import { onRequestGet as adminGet, onRequestPost as adminPost, onRequestPatch as adminPatch } from "../functions/api/admin/case-types";
function environment() { return { DB: new TestDb(), AUTH_SESSION_SECRET: "case-types-test-only-not-for-production" }; }
function request(method = "GET", body?: unknown, cookie = "", origin = "https://jurisconecta.cl") { return new Request("https://jurisconecta.cl/api/admin/case-types", { method, headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function cookie(env: ReturnType<typeof environment>, login = "gprecabarren") { return `juris_admin=${await createSession(login, env, request())}`; }
function custom(index = 0): CaseType { return { ...structuredClone(CASE_TYPE_SEED[0]), id: `local-fixture-${index}`, topic: `Tipo ficticio local ${index}`, enabled: false, sortOrder: 100 + index }; }
function complete(type: CaseType): Record<string, string> { return Object.fromEntries(type.steps.flatMap((step) => step.questions).filter((question) => question.required).map((question) => [question.id, question.options?.[0] ?? "Orientación general"])); }

test("baseline contains all 78 screenshot topics, unique stable IDs and valid purpose-specific forms", () => {
  assert.equal(CASE_TYPE_SEED.length, 78);
  assert.equal(new Set(CASE_TYPE_SEED.map((type) => type.id)).size, 78);
  for (const type of CASE_TYPE_SEED) {
    assert.equal(parseCaseType(type).ok, true, type.id);
    assert.equal(type.steps.length, 3);
    assert.equal(type.steps[0].questions.filter((question) => question.required).length, 2);
    assert.equal(validateIntakeAnswers(type, complete(type)).ok, true);
    assert.equal(type.category === "Casos más frecuentes", false);
  }
  assert.ok(CASE_TYPE_SEED.find((type) => type.topic === "Automóviles y motocicletas"));
  assert.equal(JSON.stringify(CASE_TYPE_SEED).includes("indumotoras"), false);
  assert.notDeepEqual(CASE_TYPE_SEED[0].steps[0].questions, CASE_TYPE_SEED[1].steps[0].questions);
  const investment = CASE_TYPE_SEED.find((type) => type.id === "inversion-extranjera")!;
  assert.match(investment.steps[0].questions[0].label, /inversión/);
  assert.match(investment.steps[0].questions[1].label, /sector/);
});

test("schema validation bounds editable content, safe icons, fields, total questions and options", () => {
  const initial = custom();
  for (const change of [{ id: "../bad" }, { category: "<script>bad</script>" }, { icon: "unsafe-icon" }, { sortOrder: -1 }, { enabled: "yes" }, { version: 0 }, { steps: [] }, { description: "a".repeat(601) }]) assert.equal(parseCaseType({ ...initial, ...change }).ok, false);
  for (const change of [{ type: "file" }, { label: "<b>Campo</b>" }, { maxLength: 2001 }, { options: ["one", "one"] }, { options: ["one", " one "] }, { options: ["one"] }]) {
    const value = structuredClone(initial); Object.assign(value.steps[0].questions[0], change); assert.equal(parseCaseType(value).ok, false);
  }
  const duplicate = structuredClone(initial); duplicate.steps[0].questions[1].id = duplicate.steps[0].questions[0].id;
  assert.equal(parseCaseType(duplicate).ok, false);
  const many = structuredClone(initial); many.steps = Array.from({ length: 3 }, (_, s) => ({ id: `step-${s}`, title: "Paso local", description: "", questions: Array.from({ length: 8 }, (_, q) => ({ id: `question-${s}-${q}`, label: "Campo de prueba", type: "text" as const, required: false })) }));
  assert.equal(parseCaseType(many).ok, false);
});

test("answer validation preserves draft progress but rejects unknown keys, HTML, forged options, invalid dates and numbers", () => {
  const type = custom(), answers = complete(type);
  assert.equal(validateIntakeAnswers(type, {}).ok, false);
  assert.deepEqual(validateIntakeAnswers(type, {}, true), { ok: true, answers: {} });
  assert.equal(validateIntakeAnswers(type, { ...answers, secret: "not in schema" }, true).ok, false);
  assert.equal(validateIntakeAnswers(type, { ...answers, gestion: "invented choice" }).ok, false);
  assert.equal(validateIntakeAnswers(type, { ...answers, contexto: "<script>alert(1)</script>" }).ok, false);
  assert.equal(validateIntakeAnswers(type, { ...answers, contexto: "x".repeat(601) }).ok, false);
  assert.equal(validateIntakeAnswers(type, { ...answers, gestion: 2 }).ok, false);
  type.steps[2].questions = [{ id: "fecha", label: "Fecha", type: "date", required: true }, { id: "monto", label: "Monto", type: "number", required: true }];
  const base = { gestion: answers.gestion, situacion: answers.situacion, fecha: "2026-10-15", monto: "100.50" };
  assert.equal(validateIntakeAnswers(type, base).ok, true);
  for (const change of [{ fecha: "2026-02-30" }, { fecha: "2026-13-01" }, { fecha: "1899-01-01" }, { monto: "NaN" }, { monto: "1e999" }, { monto: "1,000" }, { monto: "1000000000001" }]) assert.equal(validateIntakeAnswers(type, { ...base, ...change }).ok, false);
});

test("empty migration uses cloned TS baseline and public endpoint does not require an account", async () => {
  const env = environment();
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM case_type_catalog").first<{ n: number }>())?.n, 0);
  const types = await readCaseTypes(env.DB);
  assert.equal(types.length, 78);
  types[0].steps[0].questions[0].label = "Only local mutation";
  assert.notEqual((await readCaseType(env.DB, types[0].id))?.steps[0].questions[0].label, "Only local mutation");
  assert.equal(await readCaseType(env.DB, "../bad"), null);
  const response = await publicGet({ request: request(), env });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { types: CaseType[] }).types.length, 78);
  assert.equal((await publicGet({ request: request(), env: {} })).status, 503);
});

test("content administrators can add, preview, update and archive types with audit, versions and atomic stale-edit rejection", async () => {
  const env = environment();
  await env.DB.prepare("INSERT INTO github_administrators (github_id, github_login, role, accepted_at) VALUES (654321, 'content-fixture', 'admin', CURRENT_TIMESTAMP)").run();
  const auth = await cookie(env, "content-fixture"), type = custom();
  assert.equal((await adminGet({ request: request(), env })).status, 401);
  assert.equal((await adminPost({ request: request("POST", { type }), env })).status, 401);
  assert.equal((await adminPost({ request: request("POST", { type }, auth, "https://other.example"), env })).status, 403);
  const created = await adminPost({ request: request("POST", { type }, auth), env });
  assert.equal(created.status, 201);
  assert.equal((await readCaseTypes(env.DB)).some((item) => item.id === type.id), false);
  assert.equal((await readCaseTypes(env.DB, true)).some((item) => item.id === type.id), true);
  assert.equal((await adminPost({ request: request("POST", { type }, auth), env })).status, 409);
  const changed = { ...type, enabled: true, topic: "Solicitud de prueba local" };
  assert.equal((await adminPatch({ request: request("PATCH", { type: changed, expectedVersion: 1 }, auth), env })).status, 200);
  assert.equal((await adminPatch({ request: request("PATCH", { type: changed, expectedVersion: 1 }, auth), env })).status, 409);
  assert.equal((await readCaseType(env.DB, type.id))?.version, 2);
  assert.equal((await readCaseTypes(env.DB)).some((item) => item.id === type.id), true);
  assert.equal((await adminPatch({ request: request("PATCH", { type: { ...changed, version: 2, enabled: false }, expectedVersion: 2 }, auth), env })).status, 200);
  const audit = await env.DB.prepare("SELECT action FROM admin_audit_log WHERE target_id = ? ORDER BY rowid").bind(type.id).all<{ action: string }>();
  assert.deepEqual(audit.results.map((row) => row.action), ["case_types.create", "case_types.update", "case_types.archive"]);
  assert.equal((await readCaseType(env.DB, type.id))?.version, 3);
  const listing = await adminGet({ request: request("GET", undefined, auth), env });
  assert.equal((await listing.json() as { canManage: boolean }).canManage, true);
});

test("first override of a baseline and concurrent editors use one atomic CAS audit transaction", async () => {
  const env = environment(), auth = await cookie(env), type = structuredClone(CASE_TYPE_SEED[0]);
  assert.equal((await adminPost({ request: request("POST", { type }, auth), env })).status, 409);
  const responses = await Promise.all(["Primera edición", "Segunda edición"].map((topic) => adminPatch({ request: request("PATCH", { type: { ...type, topic }, expectedVersion: 1 }, auth), env })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await readCaseType(env.DB, type.id))?.version, 2);
  assert.equal((await readCaseTypes(env.DB, true)).length, 78);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE target_id = ?").bind(type.id).first<{ n: number }>())?.n, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM case_type_transaction_guards").first<{ n: number }>())?.n, 0);
});

test("combined baseline plus additions is capped at 120 and archiving retains schema/history", async () => {
  const env = environment(), auth = await cookie(env);
  for (let index = 0; index < caseIntakeLimits.types - CASE_TYPE_SEED.length; index++) assert.equal((await adminPost({ request: request("POST", { type: custom(index) }, auth), env })).status, 201);
  assert.equal((await readCaseTypes(env.DB, true)).length, 120);
  assert.equal((await adminPost({ request: request("POST", { type: custom(99) }, auth), env })).status, 409);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'case_types.create'").first<{ n: number }>())?.n, 42);
  const baseline = structuredClone(CASE_TYPE_SEED[0]);
  assert.equal((await adminPatch({ request: request("PATCH", { type: { ...baseline, enabled: false }, expectedVersion: 1 }, auth), env })).status, 200);
  assert.equal((await readCaseTypes(env.DB, true)).length, 120);
  assert.equal((await readCaseType(env.DB, baseline.id))?.enabled, false);
  assert.equal((await env.DB.prepare("SELECT schema_json FROM case_type_catalog WHERE id = ?").bind(baseline.id).first<{ schema_json: string }>())?.schema_json.includes(baseline.topic), true);
});
