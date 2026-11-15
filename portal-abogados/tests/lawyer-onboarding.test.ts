import assert from "node:assert/strict";
import test from "node:test";
import { createSession } from "../functions/_lib/github-auth";
import { createUserSession, type UserRole } from "../functions/_lib/user-auth";
import { CASE_CATALOG_SUMMARIES } from "../shared/case-catalog-summary";
import { lawyerApplicationPayload, lawyerDraftFromProfile, type LawyerApplicationData, type LawyerProfileData } from "../shared/lawyer-onboarding";
import worker from "../src/worker";
import { TestDb } from "./test-db";

const lawyerId = "onboarding-fixture-lawyer";
const clientId = "onboarding-fixture-client";
const email = "abogacia@example.test";
const family = "Derecho Familiar";
const familyTypes = CASE_CATALOG_SUMMARIES.filter((type) => type.category === family);
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQTkAAAAASUVORK5CYII=";
const draft = {
  ...lawyerDraftFromProfile(),
  fullName: "Perfil profesional ficticio",
  phone: "+12025550101",
  region: "Biobío",
  commune: "Concepción",
  rutNumber: "99999999",
  rutVerifier: "9",
  graduationDate: "2017-06-01",
  birthDate: "1989-05-01",
  university: "Universidad de demostración",
  experienceYears: "8",
  bio: "Perfil de demostración escrito para comprobar la persistencia de la presentación.",
  attentionMode: "hybrid",
  serviceLocalities: "Biobío; Concepción",
  specialties: [family],
  practiceTopicIds: [familyTypes[0].id],
  linkedinUrl: "https://example.test/perfil",
  referralCode: "EJEMPLO-42",
  avatarDataUrl: photo,
  planCode: "gold",
  manualVerificationConsent: true,
};

function request(path: string, method = "GET", cookie = "", body?: unknown) {
  return new Request(`https://jurisconecta.cl${path}`, {
    method,
    headers: { Cookie: cookie, Origin: "https://jurisconecta.cl", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function fixture(t: { after: (callback: () => void) => void }) {
  const db = new TestDb();
  t.after(() => db.native.close());
  const env = {
    DB: db,
    USER_AUTH_SECRET: "lawyer-onboarding-user-fixture-only",
    AUTH_SESSION_SECRET: "lawyer-onboarding-admin-fixture-only",
  };
  const publicRequest = request("/");
  async function account(id: string, role: UserRole, accountEmail: string) {
    const fullName = role === "lawyer" ? "Postulante de prueba" : "Cliente de prueba";
    await db.prepare("INSERT INTO users (id, email, full_name, role, status) VALUES (?, ?, ?, ?, ?)").bind(id, accountEmail, fullName, role, role === "lawyer" ? "pending" : "active").run();
    return `juris_user=${await createUserSession({ id, email: accountEmail, fullName, role, sessionVersion: 0 }, env, publicRequest)}`;
  }
  const lawyer = await account(lawyerId, "lawyer", email);
  const client = await account(clientId, "person", "cliente@example.test");
  await db.prepare("INSERT INTO lawyer_profiles (user_id) VALUES (?)").bind(lawyerId).run();
  const admin = `juris_admin=${await createSession("gprecabarren", env, publicRequest)}`;
  const fetch = (path: string, method: string, cookie: string, body?: unknown) =>
    worker.fetch(request(path, method, cookie, body), env as unknown as Parameters<typeof worker.fetch>[1]);
  return { db, lawyer, client, admin, fetch };
}

function submit(f: Awaited<ReturnType<typeof fixture>>, fields: Record<string, unknown> = {}, cookie = f.lawyer) {
  return f.fetch("/api/lawyer/application", "POST", cookie, { ...lawyerApplicationPayload(draft), ...fields });
}

async function profile(f: Awaited<ReturnType<typeof fixture>>) {
  const response = await f.fetch("/api/lawyer/profile", "GET", f.lawyer);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json() as Promise<{ profile: LawyerProfileData; application: LawyerApplicationData }>;
}

const approval = {
  userId: lawyerId, decision: "approve", verificationMethod: "video",
  evidenceNote: "Se revisaron originales en la videollamada ficticia de prueba.", verifiedOriginals: true,
};

test("la postulación conserva perfil y preferencias sin acreditar, gastar ni aceptar secretos del formulario", async (t) => {
  const f = await fixture(t);
  const extras = { email: "alterado@example.test", emailVerified: true, idDocumentNumber: "SERIAL-DE-PRUEBA", verification: "biometric", paymentToken: "pago-ficticio" };
  const results = await Promise.all([submit(f, extras), submit(f, extras)]);
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
  assert.deepEqual(await results.find((response) => response.status === 201)?.json(), { submitted: true, verification: "manual" });
  const saved = await profile(f);
  assert.equal(saved.profile.full_name, draft.fullName);
  assert.equal(saved.profile.email, email);
  assert.equal(saved.profile.email_verified_at, null);
  assert.equal(saved.profile.avatar_data_url, photo);
  assert.equal(saved.application.country, "Chile");
  assert.equal(saved.application.university, draft.university);
  assert.equal(saved.application.graduation_date, draft.graduationDate);
  assert.equal(saved.application.birth_date, draft.birthDate);
  assert.equal(saved.application.attention_mode, "hybrid");
  assert.equal(saved.application.service_localities, draft.serviceLocalities);
  assert.equal(saved.application.linkedin_url, draft.linkedinUrl);
  assert.equal(saved.application.referral_code, draft.referralCode);
  assert.equal(saved.application.selected_plan_code, "gold");
  assert.deepEqual(JSON.parse(String(saved.application.practice_topics_json)), draft.practiceTopicIds);
  assert.equal(Object.hasOwn(saved.application, "id_document_number"), false);
  const state = await f.db.prepare("SELECT u.status, lp.application_status, lp.credit_balance FROM users u JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.id = ?").bind(lawyerId).first();
  assert.deepEqual({ ...state }, { status: "pending", application_status: "submitted", credit_balance: 0 });
  const serial = await f.db.prepare("SELECT id_document_number FROM lawyer_applications WHERE user_id = ?").bind(lawyerId).first<{ id_document_number: string | null }>();
  assert.equal(serial?.id_document_number, null);
  const market = await f.fetch("/api/lawyer/cases?view=preferred", "GET", f.lawyer);
  assert.deepEqual(await market.json(), { cases: [], creditBalance: 0, verified: false });
});

test("la postulación rechaza campos inválidos y usuarios de otro rol antes de guardar", async (t) => {
  const f = await fixture(t);
  assert.equal((await submit(f, {}, f.client)).status, 401);
  assert.equal((await f.fetch("/api/lawyer/profile", "GET", f.client)).status, 401);
  for (const invalid of [
    { manualVerificationConsent: false },
    { graduationDate: "2017-02-30" },
    { birthDate: "2018-05-01" },
    { phone: "ABCDEF" },
    { region: "" },
    { serviceLocalities: "" },
    { practiceTopicIds: ["id-que-no-existe"] },
    { linkedinUrl: "javascript:alert(1)" },
    { avatarDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
  ]) {
    const result = await submit(f, invalid);
    assert.equal(result.status, 400, JSON.stringify(invalid));
  }
  await f.db.prepare("UPDATE subscription_plans SET active = 0 WHERE code = 'gold'").run();
  assert.equal((await submit(f)).status, 400);
  const saved = await profile(f);
  assert.equal(saved.profile.application_status, "draft");
  assert.equal(saved.profile.full_name, "Postulante de prueba");
  assert.deepEqual(saved.application, {});
});

test("el perfil aprobado admite cambios profesionales y protege correo, acreditación y saldo", async (t) => {
  const f = await fixture(t);
  assert.equal((await submit(f)).status, 201);
  const pendingPatch = await f.fetch("/api/lawyer/profile", "PATCH", f.lawyer, { fullName: draft.fullName, professionalDetails: { referralCode: "RESTRINGIDO" } });
  assert.equal(pendingPatch.status, 409);
  assert.equal((await f.fetch("/api/admin/applications", "PATCH", f.admin, { ...approval, verifiedOriginals: false })).status, 400);
  assert.equal((await f.fetch("/api/admin/applications", "PATCH", f.admin, approval)).status, 200);
  await f.db.prepare("UPDATE lawyer_applications SET id_document_number = 'DATO-LEGADO-DE-PRUEBA' WHERE user_id = ?").bind(lawyerId).run();
  const wallet = () => f.db.prepare("SELECT plan_code, credit_balance, billing_version FROM lawyer_profiles WHERE user_id = ?").bind(lawyerId).first();
  const before = await wallet();
  const updated = await f.fetch("/api/lawyer/profile", "PATCH", f.lawyer, {
    fullName: draft.fullName, email: "otro@example.test", avatarDataUrl: null,
    region: "", commune: "Buenos Aires", specialties: [family],
    professionalDetails: { country: "Argentina", graduationDate: "2016-05-01", referralCode: "ACTUALIZADO", rut: "123456785", selectedPlanCode: "silver", applicationStatus: "draft", idDocumentNumber: "ALTERAR" },
  });
  assert.equal(updated.status, 200, await updated.text());
  const saved = await profile(f);
  assert.equal(saved.profile.email, email);
  assert.equal(saved.profile.application_status, "approved");
  assert.equal(saved.profile.region, null);
  assert.equal(saved.profile.commune, "Buenos Aires");
  assert.equal(saved.profile.avatar_data_url, null);
  assert.equal(saved.application.country, "Argentina");
  assert.equal(saved.application.rut, `${draft.rutNumber}${draft.rutVerifier}`);
  assert.equal(saved.application.selected_plan_code, "gold");
  assert.equal(saved.application.graduation_date, "2016-05-01");
  assert.equal(saved.application.referral_code, "ACTUALIZADO");
  assert.deepEqual(JSON.parse(String(saved.application.practice_topics_json)), draft.practiceTopicIds);
  assert.equal(Object.hasOwn(saved.application, "id_document_number"), false);
  assert.deepEqual(await wallet(), before);
  assert.equal((await submit(f)).status, 409);
});

test("una corrección enviada con los campos anteriores conserva los detalles que ya se guardaron", async (t) => {
  const f = await fixture(t);
  assert.equal((await submit(f, { country: "Argentina", region: "", commune: "Buenos Aires" })).status, 201);
  assert.equal((await f.fetch("/api/admin/applications", "PATCH", f.admin, { userId: lawyerId, decision: "request_changes", note: "Corrige el nombre de la universidad." })).status, 200);
  const legacy = await f.fetch("/api/lawyer/application", "POST", f.lawyer, {
    rut: `${draft.rutNumber}-${draft.rutVerifier}`, bio: draft.bio, university: "Universidad corregida de demostración",
    graduationDate: draft.graduationDate, specialties: [family], planCode: "gold", manualVerificationConsent: true,
  });
  assert.equal(legacy.status, 201, await legacy.text());
  const saved = await profile(f);
  assert.equal(saved.profile.application_status, "submitted");
  assert.equal(saved.profile.application_review_note, null);
  assert.equal(saved.profile.avatar_data_url, photo);
  assert.equal(saved.profile.commune, "Buenos Aires");
  assert.equal(saved.application.country, "Argentina");
  assert.equal(saved.application.referral_code, draft.referralCode);
  assert.equal(saved.application.university, "Universidad corregida de demostración");
  assert.deepEqual(JSON.parse(String(saved.application.practice_topics_json)), draft.practiceTopicIds);
});

test("los casos preferentes aplican el tipo exacto y mantienen la compatibilidad de áreas históricas", async (t) => {
  const f = await fixture(t);
  const civil = CASE_CATALOG_SUMMARIES.find((type) => type.category === "Derecho Civil");
  assert.ok(civil);
  assert.equal((await submit(f, { specialties: [family, civil.category] })).status, 201);
  assert.equal((await f.fetch("/api/admin/applications", "PATCH", f.admin, approval)).status, 200);
  async function addCase(id: string, category: string, typeId?: string) {
    await f.db.prepare("INSERT INTO legal_cases (id, person_id, category, title, description) VALUES (?, ?, ?, 'Caso ficticio', 'Descripción ficticia')").bind(id, clientId, category).run();
    if (typeId) await f.db.prepare("INSERT INTO case_intake_responses (case_id, type_id, type_version, schema_json, answers_json) VALUES (?, ?, 1, ?, '{}')").bind(id, typeId, JSON.stringify({ category })).run();
  }
  await addCase("preferido-exacto", family, familyTypes[0].id);
  await addCase("misma-area-otro-tipo", family, familyTypes[1].id);
  await addCase("legado-sin-tipo", family);
  await addCase("area-sin-tipos-elegidos", civil.category, civil.id);
  await addCase("fuera-de-preferencias", "Derecho Penal");
  const response = await f.fetch("/api/lawyer/cases?view=preferred", "GET", f.lawyer);
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json() as { cases: { id: string; contact_accessed: number; contact_email: string | null }[] };
  const fixtures = data.cases.filter((item) => ["preferido-exacto", "misma-area-otro-tipo", "legado-sin-tipo", "area-sin-tipos-elegidos", "fuera-de-preferencias"].includes(item.id));
  assert.deepEqual(fixtures.map((item) => item.id).sort(), ["area-sin-tipos-elegidos", "legado-sin-tipo", "preferido-exacto"]);
  assert.ok(fixtures.every((item) => item.contact_accessed === 0 && item.contact_email === null));
});
