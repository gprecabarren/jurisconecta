import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { TestDb } from "./test-db";
import { createUserSession, type UserRole } from "../functions/_lib/user-auth";
import { handleIntakeDraft, handleIntakeSubmit, hasVerifiedEmail } from "../functions/_lib/case-intake";
import { CASE_TYPE_SEED } from "../shared/case-intake-seed";
import type { CaseType } from "../shared/case-intake";
import { onRequestGet as lawyerCases, onRequestPost as unlock } from "../functions/api/lawyer/cases";
import worker from "../src/worker";

const clientId = "person-cliente-prueba", lawyerId = "lawyer-maria-recabarren";
const type = CASE_TYPE_SEED.find((item) => item.id === "inversion-extranjera")!;
const contact = { fullName: "Persona ficticia de prueba", phone: "+56 9 5555 1212", region: "Biobío", commune: "Concepción", attentionMode: "remote" };
type DraftView = { id: string; version: number; schema: CaseType; answers: Record<string, string>; contact: typeof contact; expiresAt: number };
function environment() { return { DB: new TestDb(), USER_AUTH_SECRET: "intake-fixture-secret-not-real", AUTH_SESSION_SECRET: "intake-fixture-admin-not-real", GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "fixture-only", ASSETS: { fetch: async () => new Response("fixture asset") } }; }
function request(method = "GET", body?: unknown, cookie = "", path = "/api/intake/draft", origin = "https://jurisconecta.cl") {
  return new Request(`https://jurisconecta.cl${path}`, { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.12" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function answers(schema = type): Record<string, string> {
  return Object.fromEntries(schema.steps.flatMap((step) => step.questions).filter((question) => question.required).map((question) => [question.id, question.type === "select" ? question.options![0] : question.type === "date" ? "2026-10-01" : question.type === "number" ? "1" : "Antecedente completamente ficticio para testear."]));
}
async function createDraft(env: ReturnType<typeof environment>, overrides: Record<string, unknown> = {}, cookie = "") {
  const response = await handleIntakeDraft(request("POST", { typeId: type.id, answers: answers(), contact, step: type.steps.length, ...overrides }, cookie), env);
  assert.equal(response.status, 201, await response.clone().text());
  const data = await response.json() as { draft: DraftView };
  const intakeCookie = response.headers.get("Set-Cookie")!.split(";")[0];
  return { response, cookie: intakeCookie, draft: data.draft };
}
async function userCookie(env: ReturnType<typeof environment>, id: string, verified = false) {
  if (verified) await env.DB.prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  const row = await env.DB.prepare("SELECT email, full_name, role, session_version FROM users WHERE id = ?").bind(id).first<{ email: string; full_name: string; role: UserRole; session_version: number }>();
  assert.ok(row);
  return `juris_user=${await createUserSession({ id, email: row.email, fullName: row.full_name, role: row.role, sessionVersion: row.session_version }, env, request())}`;
}
function submit(env: ReturnType<typeof environment>, cookie: string, version: number) { return handleIntakeSubmit(request("POST", { confirm: true, expectedVersion: version }, cookie, "/api/intake/submit"), env); }

test("anonymous drafts use private random capabilities and encrypted bounded storage, not browser storage", async () => {
  const env = environment(), before = Date.now(), created = await createDraft(env);
  const stored = await env.DB.prepare("SELECT * FROM case_intake_drafts WHERE id = ?").bind(created.draft.id).first<{ token_hash: string; payload_cipher: string; owner_user_id: string | null }>();
  assert.ok(stored);
  const token = created.cookie.split("=")[1];
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(stored.token_hash, token); assert.equal(stored.owner_user_id, null);
  assert.equal(JSON.stringify(stored).includes(contact.fullName), false);
  assert.equal(JSON.stringify(stored).includes(contact.phone), false);
  assert.equal(JSON.stringify(stored).includes(answers().gestion), false);
  assert.match(stored.payload_cipher, /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  assert.ok(created.draft.expiresAt >= before + 48 * 3600000 && created.draft.expiresAt <= Date.now() + 48 * 3600000);
  assert.match(created.response.headers.get("Set-Cookie")!, /HttpOnly; Secure; SameSite=Lax; Max-Age=172800/);
  assert.equal(created.response.headers.get("Cache-Control"), "no-store");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM legal_cases").first<{ n: number }>())?.n, 0);
  const recovered = await (await handleIntakeDraft(request("GET", undefined, created.cookie), env)).json() as { draft: DraftView };
  assert.equal(recovered.draft.contact.fullName, contact.fullName);
  const absent = await (await handleIntakeDraft(request("GET"), env)).json() as { draft: unknown };
  assert.equal(absent.draft, null);
  const forged = await (await handleIntakeDraft(request("GET", undefined, `juris_intake=${"A".repeat(43)}`), env)).json() as { draft: unknown };
  assert.equal(forged.draft, null);
  // The actual public intake source must not write contact/answers into JS storage.
  const page = readFileSync("src/app/solicitar/page.tsx", "utf8");
  assert.equal(/(?:localStorage|sessionStorage)\s*\./.test(page), false);
});

test("draft ownership binds on customer sign-in; other accounts and anonymous readers cannot recover it", async () => {
  const env = environment(), created = await createDraft(env), client = await userCookie(env, clientId);
  const owned = await (await handleIntakeDraft(request("GET", undefined, `${created.cookie}; ${client}`), env)).json() as { draft: DraftView };
  assert.equal(owned.draft.id, created.draft.id);
  assert.equal((await env.DB.prepare("SELECT owner_user_id FROM case_intake_drafts WHERE id = ?").bind(created.draft.id).first<{ owner_user_id: string }>())?.owner_user_id, clientId);
  assert.equal((await (await handleIntakeDraft(request("GET", undefined, created.cookie), env)).json() as { draft: unknown }).draft, null);
  const other = await userCookie(env, lawyerId);
  assert.equal((await (await handleIntakeDraft(request("GET", undefined, `${created.cookie}; ${other}`), env)).json() as { draft: unknown }).draft, null);
  assert.equal((await handleIntakeDraft(request("POST", { typeId: type.id, answers: answers(), contact, step: 0 }, other), env)).status, 403);
  await env.DB.prepare("UPDATE users SET role = 'lawyer', session_version = session_version + 1 WHERE id = ?").bind(clientId).run();
  const converted = await userCookie(env, clientId);
  assert.equal((await (await handleIntakeDraft(request("GET", undefined, `${created.cookie}; ${converted}`), env)).json() as { draft: unknown }).draft, null);
  await handleIntakeDraft(request("DELETE", undefined, `${created.cookie}; ${converted}`), env);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM case_intake_drafts WHERE id = ?").bind(created.draft.id).first<{ n: number }>())?.n, 1);
});

test("draft saves are CAS-protected and retain the exact initial schema snapshot after an admin edit", async () => {
  const env = environment(), created = await createDraft(env);
  const altered: CaseType = { ...type, version: type.version + 1, topic: "Nuevo nombre de formulario", steps: [{ id: "nueva-etapa", title: "Una etapa nueva", description: "Descripción modificada para prueba.", questions: [{ id: "nueva-pregunta", label: "Nueva pregunta distinta", type: "text", required: true }] }] };
  await env.DB.prepare("INSERT INTO case_type_catalog (id, schema_json, version, enabled, sort_order, updated_by) VALUES (?, ?, ?, 1, 0, 'fixture')").bind(type.id, JSON.stringify(altered), altered.version).run();
  const body = { typeId: type.id, answers: answers(), contact, step: 1, expectedVersion: created.draft.version };
  const concurrent = await Promise.all([handleIntakeDraft(request("POST", body, created.cookie), env), handleIntakeDraft(request("POST", body, created.cookie), env)]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  const recovered = await (await handleIntakeDraft(request("GET", undefined, created.cookie), env)).json() as { draft: DraftView };
  assert.equal(recovered.draft.version, 2); assert.equal(recovered.draft.schema.version, type.version);
  assert.equal(recovered.draft.schema.topic, type.topic);
  const client = await userCookie(env, clientId, true);
  const response = await submit(env, `${created.cookie}; ${client}`, 2);
  assert.equal(response.status, 201, await response.clone().text());
  const row = await env.DB.prepare("SELECT type_version, schema_json FROM case_intake_responses").first<{ type_version: number; schema_json: string }>();
  assert.equal(row?.type_version, type.version); assert.equal(JSON.parse(row!.schema_json).topic, type.topic);
});

test("expired drafts cannot be recovered or submitted and neither unverified email nor professional role can publish", async () => {
  const env = environment(), created = await createDraft(env), client = await userCookie(env, clientId), lawyer = await userCookie(env, lawyerId, true);
  assert.equal((await submit(env, created.cookie, 1)).status, 401);
  assert.equal((await submit(env, `${created.cookie}; ${client}`, 1)).status, 403);
  assert.equal((await submit(env, `${created.cookie}; ${lawyer}`, 1)).status, 403);
  assert.equal(await hasVerifiedEmail(env, clientId), false);
  await env.DB.prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(clientId).run();
  await env.DB.prepare("UPDATE case_intake_drafts SET expires_at = ? WHERE id = ?").bind(Date.now() - 1, created.draft.id).run();
  assert.equal((await (await handleIntakeDraft(request("GET", undefined, created.cookie), env)).json() as { draft: unknown }).draft, null);
  assert.equal((await submit(env, `${created.cookie}; ${client}`, 1)).status, 404);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM legal_cases").first<{ n: number }>())?.n, 0);
});

test("existing linked Google identity and explicit verified-email timestamp each satisfy verification", async () => {
  const env = environment();
  assert.equal(await hasVerifiedEmail(env, clientId), false);
  await env.DB.prepare("INSERT INTO google_identities (subject, user_id) VALUES ('fictitious-google-subject', ?)").bind(clientId).run();
  assert.equal(await hasVerifiedEmail(env, clientId), true);
  await env.DB.prepare("DELETE FROM google_identities WHERE user_id = ?").bind(clientId).run();
  assert.equal(await hasVerifiedEmail(env, clientId), false);
  await env.DB.prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(clientId).run();
  assert.equal(await hasVerifiedEmail(env, clientId), true);
});

test("submission is atomic and replayable under concurrency; no contact is exposed before client acceptance", async () => {
  const env = environment(), created = await createDraft(env), client = await userCookie(env, clientId, true), lawyer = await userCookie(env, lawyerId);
  const cookie = `${created.cookie}; ${client}`;
  const responses = await Promise.all([submit(env, cookie, 1), submit(env, cookie, 1)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  const outcomes = await Promise.all(responses.map((response) => response.json() as Promise<{ id: string }>));
  assert.equal(outcomes[0].id, outcomes[1].id);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM legal_cases WHERE person_id = ?").bind(clientId).first<{ n: number }>())?.n, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM case_intake_responses").first<{ n: number }>())?.n, 1);
  const stored = await env.DB.prepare("SELECT payload_cipher, submitted_case_id FROM case_intake_drafts WHERE id = ?").bind(created.draft.id).first<{ payload_cipher: string | null; submitted_case_id: string }>();
  assert.equal(stored?.payload_cipher, null); assert.equal(stored?.submitted_case_id, outcomes[0].id);
  assert.equal((await submit(env, cookie, 1)).status, 200);
  const pool = await lawyerCases({ request: request("GET", undefined, lawyer), env });
  const content = await pool.text();
  assert.equal(content.includes(contact.fullName), false); assert.equal(content.includes(contact.phone), false);
  assert.equal(content.includes("cliente.prueba@jurisconecta.cl"), false);
  assert.equal((await unlock({ request: request("POST", { caseId: outcomes[0].id }, lawyer, "/api/lawyer/cases?action=access"), env })).status, 403);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM case_accesses").first<{ n: number }>())?.n, 0);
});

test("invalid or retired schemas and incomplete final answers cannot publish; transaction errors leave no partial case", async () => {
  const env = environment(), created = await createDraft(env, { answers: {} }), client = await userCookie(env, clientId, true);
  assert.equal((await submit(env, `${created.cookie}; ${client}`, 1)).status, 400);
  const valid = await createDraft(env);
  await env.DB.prepare("INSERT INTO case_type_catalog (id, schema_json, version, enabled, sort_order, updated_by) VALUES (?, ?, ?, 0, 0, 'fixture')").bind(type.id, JSON.stringify({ ...type, enabled: false }), type.version).run();
  assert.equal((await submit(env, `${valid.cookie}; ${client}`, 1)).status, 409);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM legal_cases").first<{ n: number }>())?.n, 0);
  await env.DB.prepare("DELETE FROM case_type_catalog WHERE id = ?").bind(type.id).run();
  env.DB.native.exec("CREATE TRIGGER intake_test_failure BEFORE INSERT ON case_details BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END;");
  assert.equal((await submit(env, `${valid.cookie}; ${client}`, 1)).status, 409);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM legal_cases").first<{ n: number }>())?.n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM intake_assertions").first<{ n: number }>())?.n, 0);
  assert.ok((await env.DB.prepare("SELECT payload_cipher FROM case_intake_drafts WHERE id = ?").bind(valid.draft.id).first<{ payload_cipher: string }>())?.payload_cipher);
});

test("HTTP intake enforces CSRF, method restrictions and private responses", async () => {
  const env = environment();
  const runtime = env as unknown as Parameters<typeof worker.fetch>[1];
  const body = { typeId: type.id, answers: answers(), contact, step: 0 };
  assert.equal((await worker.fetch(request("POST", body, "", "/api/intake/draft", "https://evil.example"), runtime)).status, 403);
  assert.equal((await worker.fetch(request("PUT", body), runtime)).status, 405);
  const saved = await worker.fetch(request("POST", body), runtime);
  assert.equal(saved.status, 201, await saved.clone().text());
  assert.equal(saved.headers.get("Cache-Control"), "no-store");
  assert.equal((await worker.fetch(request("GET", undefined, "", "/api/intake/submit"), runtime)).status, 405);
});
