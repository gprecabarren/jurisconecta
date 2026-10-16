import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { TestDb } from "./test-db";
import { googleCallback, googleRegistration, oauthHash, startGoogle, validGoogleClaims } from "../functions/_lib/google-auth";
import { handleIntakeDraft, hasVerifiedEmail } from "../functions/_lib/case-intake";
import { onRequestPost as register } from "../functions/api/auth/register";
import { onRequestPost as login } from "../functions/api/auth/login";
import { readUserSession } from "../functions/_lib/user-auth";
import { CASE_TYPE_SEED } from "../shared/case-intake-seed";

// OAuth signatures/JWKS are generated locally. The mock rejects EVERY unexpected
// URL: no provider, production database, real account or external email is used.
const localKey = generateKeyPair("RS256");
const fixtureType = CASE_TYPE_SEED.find((type) => type.id === "inversion-extranjera")!;
const contact = { fullName: "Persona ficticia OAuth", phone: "+56 9 5555 1313", region: "Biobío", commune: "Concepción", attentionMode: "remote" };
function environment() { return { DB: new TestDb(), USER_AUTH_SECRET: "intake-google-test-only", GOOGLE_CLIENT_ID: "intake-fixture.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "intake-test-not-real" }; }
function request(path: string, method = "GET", body?: unknown, cookie = "") { return new Request(`https://jurisconecta.cl${path}`, { method, headers: { Cookie: cookie, Origin: "https://jurisconecta.cl", "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.52" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
function responseCookie(response: Response, name: string) { return new RegExp(`(?:^|,\\s*)${name}=([^;]*)`).exec(response.headers.get("Set-Cookie") || "")?.[1]; }
async function draft(env: ReturnType<typeof environment>) {
  const answers = Object.fromEntries(fixtureType.steps.flatMap((step) => step.questions).filter((question) => question.required).map((question) => [question.id, question.options?.[0] ?? "Antecedente ficticio"]));
  const response = await handleIntakeDraft(request("/api/intake/draft", "POST", { typeId: fixtureType.id, answers, contact, step: 3 }), env);
  assert.equal(response.status, 201);
  const data = await response.json() as { draft: { id: string; answers: Record<string, string>; contact: typeof contact } };
  return { cookie: `juris_intake=${responseCookie(response, "juris_intake")}`, ...data };
}
async function begin(env: ReturnType<typeof environment>, role = "person", next = "/solicitar/", cookie = "", intent = "register") {
  const response = await startGoogle(request(`/auth/google/start?${new URLSearchParams({ intent, role, next })}`, "GET", undefined, cookie), env);
  assert.equal(response.status, 303);
  const url = new URL(response.headers.get("Location")!);
  assert.equal(url.origin, "https://accounts.google.com");
  const state = url.searchParams.get("state")!;
  const flow = await env.DB.prepare("SELECT role, return_to, nonce, verifier FROM google_oauth_flows WHERE state_hash = ?").bind(await oauthHash(state)).first<{ role: string; return_to: string | null; nonce: string; verifier: string }>();
  assert.ok(flow);
  return { response, url, state, flow, cookie: `${cookie ? `${cookie}; ` : ""}juris_google_state=${state}` };
}
async function mockGoogle(t: TestContext, nonce: string, overrides: Record<string, unknown> = {}) {
  const keys = await localKey, jwk = { ...await exportJWK(keys.publicKey), kid: "intake-local-key", alg: "RS256", use: "sig" }, calls: { url: string; body: string }[] = [];
  const jwt = await new SignJWT({ nonce, sub: "intake-fictitious-subject", email: "oauth.intake@example.test", email_verified: true, name: contact.fullName, ...overrides }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).setIssuer("https://accounts.google.com").setAudience("intake-fixture.apps.googleusercontent.com").setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input), body = init?.body?.toString() ?? "";
    calls.push({ url, body });
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ id_token: jwt });
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
    throw new Error("Unexpected external URL in isolated OAuth test");
  });
  return calls;
}

test("Google intake return path is a strict single-path allowlist; OAuth URLs contain no draft/contact details", async () => {
  for (const [next, expected] of [["/solicitar/", "/solicitar/"], ["https://evil.example/", null], ["//evil.example", null], ["/solicitar/?token=private", null], ["/solicitar", null], ["/admin/", null], ["/\\evil.example/", null]] as const) {
    const env = environment(), stored = await draft(env), started = await begin(env, "person", next, stored.cookie);
    assert.equal(started.flow.return_to, expected);
    assert.equal(started.url.searchParams.get("redirect_uri"), "https://jurisconecta.cl/auth/google/callback");
    assert.equal(started.url.searchParams.get("scope"), "openid email profile");
    assert.equal(started.url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(started.url.searchParams.get("code_challenge"), await oauthHash(started.flow.verifier));
    assert.deepEqual([...started.url.searchParams.keys()].sort(), ["client_id", "redirect_uri", "response_type", "scope", "state", "nonce", "code_challenge", "code_challenge_method", "prompt"].sort());
    for (const secret of [contact.fullName, contact.phone, stored.draft.id, stored.cookie.split("=")[1], "inversion-extranjera"]) assert.equal(decodeURIComponent(started.url.toString()).includes(secret), false);
    assert.equal(responseCookie(started.response, "juris_intake"), undefined);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM case_intake_drafts").first<{ n: number }>())?.n, 1);
  }
  const invalidRole = await begin(environment(), "admin"); assert.equal(invalidRole.flow.role, "person");
});

test("verified Google stages registration without creating a user; terms then resume the same private draft", async (t) => {
  const env = environment(), stored = await draft(env), start = await begin(env, "person", "/solicitar/", stored.cookie);
  const before = await env.DB.prepare("SELECT payload_cipher FROM case_intake_drafts WHERE id = ?").bind(stored.draft.id).first<{ payload_cipher: string }>();
  const calls = await mockGoogle(t, start.flow.nonce);
  const callback = await googleCallback(request(`/auth/google/callback?state=${start.state}&code=local-test-code`, "GET", undefined, start.cookie), env);
  assert.equal(callback.status, 303); assert.equal(callback.headers.get("Location"), "https://jurisconecta.cl/registro/google/");
  assert.equal(responseCookie(callback, "juris_intake"), undefined);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE email = 'oauth.intake@example.test'").first<{ n: number }>())?.n, 0);
  const token = responseCookie(callback, "juris_google_registration"); assert.ok(token);
  const cookies = `${stored.cookie}; juris_google_registration=${token}`;
  const pending = await googleRegistration(request("/api/auth/google/registration", "GET", undefined, cookies), env);
  assert.deepEqual(await pending.json(), { email: "oauth.intake@example.test", fullName: contact.fullName, role: "person" });
  assert.equal((await googleRegistration(request("/api/auth/google/registration", "POST", { fullName: contact.fullName, acceptTerms: false, email_verified_at: "forged" }, cookies), env)).status, 400);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE email = 'oauth.intake@example.test'").first<{ n: number }>())?.n, 0);
  const completed = await googleRegistration(request("/api/auth/google/registration", "POST", { fullName: contact.fullName, acceptTerms: true, role: "lawyer", email: "forged@example.test", return_to: "https://evil.example", email_verified_at: "forged" }, cookies), env);
  assert.equal(completed.status, 200); assert.deepEqual(await completed.json(), { destination: "/solicitar/" });
  const user = await env.DB.prepare("SELECT id, role, email_verified_at, terms_accepted_at FROM users WHERE email = 'oauth.intake@example.test'").first<{ id: string; role: string; email_verified_at: string; terms_accepted_at: string }>();
  assert.ok(user); assert.equal(user.role, "person"); assert.ok(user.email_verified_at); assert.notEqual(user.email_verified_at, "forged"); assert.ok(user.terms_accepted_at);
  const resumed = await handleIntakeDraft(request("/api/intake/draft", "GET", undefined, `${stored.cookie}; juris_user=${responseCookie(completed, "juris_user")}`), env);
  const data = await resumed.json() as { draft: typeof stored.draft; user: { role: string; emailVerified: boolean } };
  assert.equal(data.draft.id, stored.draft.id); assert.deepEqual(data.draft.answers, stored.draft.answers); assert.deepEqual(data.draft.contact, contact); assert.equal(data.user.emailVerified, true);
  assert.equal((await env.DB.prepare("SELECT payload_cipher FROM case_intake_drafts WHERE id = ?").bind(stored.draft.id).first<{ payload_cipher: string }>())?.payload_cipher, before?.payload_cipher);
  assert.equal((await googleRegistration(request("/api/auth/google/registration", "POST", { fullName: contact.fullName, acceptTerms: true }, cookies), env)).status, 401);
  assert.equal(calls.length, 2);
  for (const { url, body } of calls) for (const secret of [stored.draft.id, stored.cookie.split("=")[1], contact.fullName, contact.phone, "inversion-extranjera"]) assert.equal(`${url} ${body}`.includes(secret), false);
});

test("existing Google lawyer identity retains its role and professional destination despite person registration request", async (t) => {
  const env = environment(), stored = await draft(env), id = "lawyer-maria-recabarren";
  await env.DB.prepare("INSERT INTO google_identities (subject, user_id) VALUES ('existing-lawyer-subject', ?)").bind(id).run();
  const original = await env.DB.prepare("SELECT email, role FROM users WHERE id = ?").bind(id).first<{ email: string; role: string }>(); assert.ok(original);
  const count = (await env.DB.prepare("SELECT COUNT(*) n FROM users").first<{ n: number }>())!.n;
  const started = await begin(env, "person", "/solicitar/", stored.cookie);
  await mockGoogle(t, started.flow.nonce, { sub: "existing-lawyer-subject", email: original.email });
  const response = await googleCallback(request(`/auth/google/callback?state=${started.state}&code=local-code`, "GET", undefined, started.cookie), env);
  assert.equal(response.status, 303); assert.equal(response.headers.get("Location"), "https://jurisconecta.cl/dashboard");
  assert.equal(responseCookie(response, "juris_google_registration"), undefined); assert.equal(responseCookie(response, "juris_intake"), undefined);
  const session = await readUserSession(request("/", "GET", undefined, `juris_user=${responseCookie(response, "juris_user")}`), env);
  assert.equal(session?.role, "lawyer"); assert.equal(session?.id, id);
  assert.equal((await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(id).first<{ role: string }>())?.role, "lawyer");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM users").first<{ n: number }>())?.n, count);
  assert.equal((await env.DB.prepare("SELECT owner_user_id FROM case_intake_drafts WHERE id = ?").bind(stored.draft.id).first<{ owner_user_id: string | null }>())?.owner_user_id, null);
});

test("Google never auto-links an existing password account even when verified provider email differs only by case", async (t) => {
  const env = environment(), created = await register({ request: request("/api/auth/register", "POST", { fullName: "Password fixture", email: "OAuth.Existing@Example.Test", password: "fixture-password-123", role: "person", email_verified_at: "forged", emailVerified: true }), env });
  assert.equal(created.status, 200);
  const user = await env.DB.prepare("SELECT id, email_verified_at FROM users WHERE email = 'oauth.existing@example.test'").first<{ id: string; email_verified_at: string | null }>(); assert.ok(user); assert.equal(user.email_verified_at, null);
  const started = await begin(env);
  await mockGoogle(t, started.flow.nonce, { email: "OAUTH.EXISTING@EXAMPLE.TEST" });
  const response = await googleCallback(request(`/auth/google/callback?state=${started.state}&code=local-code`, "GET", undefined, started.cookie), env);
  assert.match(response.headers.get("Location")!, /google_error=existing/);
  assert.equal(responseCookie(response, "juris_user"), undefined);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM google_identities WHERE user_id = ?").bind(user.id).first<{ n: number }>())?.n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM google_registrations").first<{ n: number }>())?.n, 0);
  assert.equal(await hasVerifiedEmail(env, user.id), false);
});

test("unverified Google claims and wrong browser state cannot mark email verified or create pending accounts", async (t) => {
  const env = environment(), started = await begin(env);
  const calls = await mockGoogle(t, started.flow.nonce, { email_verified: false });
  const invalidState = await googleCallback(request(`/auth/google/callback?state=${started.state}&code=local-code`, "GET", undefined, "juris_google_state=wrong"), env);
  assert.match(invalidState.headers.get("Location")!, /google_error=state/); assert.equal(calls.length, 0);
  const unverified = await googleCallback(request(`/auth/google/callback?state=${started.state}&code=local-code`, "GET", undefined, started.cookie), env);
  assert.match(unverified.headers.get("Location")!, /google_error=invalid/);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM google_registrations").first<{ n: number }>())?.n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE email = 'oauth.intake@example.test'").first<{ n: number }>())?.n, 0);
  assert.equal(validGoogleClaims({ nonce: "expected", sub: "subject", email: "a@example.test", email_verified: "true" }, "expected"), false);
  assert.equal(validGoogleClaims({ nonce: "wrong", sub: "subject", email: "a@example.test", email_verified: true }, "expected"), false);
  const replay = await googleCallback(request(`/auth/google/callback?state=${started.state}&code=local-code`, "GET", undefined, started.cookie), env);
  assert.match(replay.headers.get("Location")!, /google_error=expired/);
});

test("case-folded concurrent customer/professional registration creates one role/account and leaves verification unforgeable", async () => {
  const env = environment(), responses = await Promise.all(["person", "lawyer"].map((role, index) => register({ request: request("/api/auth/register", "POST", { fullName: "Concurrent fixture", email: index ? "CASEFOLD@EXAMPLE.TEST" : "casefold@example.test", password: "fixture-password-123", role, email_verified_at: "2020-01-01", emailVerified: true, google_subject: "forged", next: "https://evil.example", return_to: "//evil.example" }), env })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const accounts = await env.DB.prepare("SELECT id, role, email_verified_at FROM users WHERE lower(email) = 'casefold@example.test'").all<{ id: string; role: string; email_verified_at: string | null }>();
  assert.equal(accounts.results.length, 1); assert.equal(accounts.results[0].email_verified_at, null); assert.equal(await hasVerifiedEmail(env, accounts.results[0].id), false);
  const success = responses.find((response) => response.status === 200)!;
  const data = await success.json() as { destination: string; role: string }; assert.ok(["/cliente", "/postulacion-abogado"].includes(data.destination)); assert.equal(data.role, accounts.results[0].role);
  const signedIn = await login({ request: request("/api/auth/login", "POST", { email: "  CASEFOLD@EXAMPLE.TEST  ", password: "fixture-password-123", role: accounts.results[0].role === "person" ? "lawyer" : "person", email_verified_at: "forged", next: "https://evil.example", return_to: "//evil.example" }), env });
  assert.equal(signedIn.status, 200);
  const result = await signedIn.json() as { destination: string; role: string };
  assert.equal(result.role, accounts.results[0].role); assert.ok(["/cliente", "/postulacion-abogado"].includes(result.destination));
  assert.equal(await hasVerifiedEmail(env, accounts.results[0].id), false);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM google_identities WHERE user_id = ?").bind(accounts.results[0].id).first<{ n: number }>())?.n, 0);
});
