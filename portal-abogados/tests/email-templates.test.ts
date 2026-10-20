import assert from "node:assert/strict";
import test from "node:test";
import { EMAIL_SENDER_ADDRESS, EMAIL_TEMPLATE_DEFINITIONS, emptyEmailTemplate, type EmailTemplateContent } from "../shared/email-templates";
import { emailPreviewDocument, parseEmailContent, preparePublishedEmail, previewEmailContent, readEmailTemplate, readEmailTemplates, readEmailTemplateVersions, renderEmailContent, safeActionUrl, sanitizeEmailHtml } from "../functions/_lib/email-templates";
import { handleAdminEmailTemplates } from "../functions/api/admin/email-templates";
import { createSession } from "../functions/_lib/github-auth";
import { TestDb } from "./test-db";
const fixture = EMAIL_TEMPLATE_DEFINITIONS[0];
function environment() { return { DB: new TestDb(), AUTH_SESSION_SECRET: "local-email-tests-only-no-real-delivery" }; }
function request(method = "GET", body?: unknown, cookie = "", origin: string | null = "https://jurisconecta.cl", query = "") { return new Request(`https://jurisconecta.cl/api/admin/email-templates${query}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...(origin ? { Origin: origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function adminCookie(env: ReturnType<typeof environment>, login = "gprecabarren") { return `juris_admin=${await createSession(login, env, request())}`; }
function content(change: Partial<EmailTemplateContent> = {}) { return { ...structuredClone(fixture.example), ...change }; }
async function call(env: ReturnType<typeof environment>, cookie: string, action: string, expectedRevision: number, change: Record<string, unknown> = {}) { return handleAdminEmailTemplates(request("PATCH", { id: fixture.id, action, expectedRevision, content: content(), ...change }, cookie), env); }

test("12 realistic event examples are valid drafts, never activated and include both HTML and text", () => {
  assert.equal(EMAIL_TEMPLATE_DEFINITIONS.length, 12);
  assert.equal(new Set(EMAIL_TEMPLATE_DEFINITIONS.map((item) => item.id)).size, 12);
  for (const definition of EMAIL_TEMPLATE_DEFINITIONS) {
    assert.equal(emptyEmailTemplate(definition).published, null);
    assert.ok(parseEmailContent(definition.example, definition, true).content.html.length > 100);
    const preview = previewEmailContent(definition.id, definition.example);
    assert.equal(preview.deliveryEnabled, false);
    assert.equal(preview.usesExampleData, true);
    assert.equal(preview.html.includes("{{"), false);
    assert.equal(preview.text.includes("{{"), false);
    assert.match(preview.html, /Camila Ejemplo/);
  }
});

test("HTML sanitation preserves safe layout and removes executable content, images, forms, remote URLs and tracking CSS", () => {
  const html = sanitizeEmailHtml('<script>alert(1)</script><form action="https://evil.example"><input name="password"></form><img src="https://evil.example/pixel"><iframe src="https://evil.example"></iframe><svg onload="alert(1)"></svg><table><tbody><tr><td style="color:#173342;border-radius:20px;padding:12px;background-image:url(https://evil.example/pixel);position:fixed" onclick="alert(1)">Texto</td></tr></tbody></table><a href="javascript:alert(1)">Uno</a><a href="https://evil.example">Dos</a><a href="https://jurisconecta.cl/soporte/">Seguro</a>');
  assert.match(html, /<table>/); assert.match(html, /border-radius:20px/);
  assert.doesNotMatch(html, /script|form|input|img|iframe|svg|onclick|onload|javascript|evil\.example|position|background-image/);
  assert.match(html, /href="https:\/\/jurisconecta.cl\/soporte\/"/);
  const doc = emailPreviewDocument('<a href="{{action_url}}">Probar</a>');
  assert.match(doc, /default-src 'none'/); assert.match(doc, /form-action 'none'/); assert.match(doc, /img-src 'none'/);
  assert.doesNotMatch(doc, /<script/);
});

test("variables are event-specific, escaped in HTML, cannot inject headers or forge links and never produce real action tokens", () => {
  assert.throws(() => parseEmailContent(content({ subject: "{{ticket_reference}}" }), fixture), /Variable no permitida/);
  assert.throws(() => parseEmailContent(content({ text: "{{unfinished" }), fixture), /incompleta/);
  assert.throws(() => parseEmailContent(content({ subject: "Asunto\r\nBcc: other@example.com" }), fixture), /cabecera/);
  assert.throws(() => parseEmailContent(content({ senderName: "Equipo\nBCC" }), fixture), /cabecera/);
  assert.throws(() => parseEmailContent(content({ replyTo: "other@gmail.com" }), fixture), /dirección de respuesta/);
  assert.throws(() => parseEmailContent(content({ html: "x".repeat(40_001) }), fixture), /límite/);
  assert.equal(parseEmailContent(content({ subject: "", html: "", text: "" }), fixture).content.subject, "");
  assert.throws(() => parseEmailContent(content({ subject: "", html: "", text: "" }), fixture, true), /Antes de publicar/);
  const variables = { recipient_name: '<img src=x onerror="alert(1)">', action_url: "https://jurisconecta.cl/cliente/", site_name: "JurisConecta", support_email: EMAIL_SENDER_ADDRESS, current_year: "2026" };
  const rendered = renderEmailContent(fixture.id, content(), variables);
  assert.match(rendered.html, /&lt;img/); assert.doesNotMatch(rendered.html, /<img/);
  assert.throws(() => renderEmailContent(fixture.id, content(), { ...variables, action_url: "https://evil.example/" }), /enlace de acción/);
  assert.throws(() => renderEmailContent(fixture.id, content({ subject: "{{recipient_name}}" }), { ...variables, recipient_name: "Ana\r\nBCC: bad" }), /asunto renderizado/);
  for (const bad of ["https://jurisconecta.cl.evil.example", "http://jurisconecta.cl", "https://x@jurisconecta.cl", "//jurisconecta.cl", "javascript:alert(1)", "https://jurisconecta.cl//external"]) assert.equal(safeActionUrl(bad), false);
});

test("all admin routes require a current GitHub session, strict same-origin writes, bounded JSON and no indexing", async () => {
  const env = environment();
  for (const method of ["GET", "POST", "PATCH"]) assert.equal((await handleAdminEmailTemplates(request(method, method === "GET" ? undefined : {}), env)).status, 401);
  const auth = await adminCookie(env);
  for (const origin of [null, "https://other.example"]) assert.equal((await handleAdminEmailTemplates(request("PATCH", { action: "save_draft" }, auth, origin), env)).status, 403);
  const listing = await handleAdminEmailTemplates(request("GET", undefined, auth), env);
  assert.equal(listing.status, 200); assert.equal(listing.headers.get("Cache-Control"), "no-store"); assert.match(listing.headers.get("X-Robots-Tag") || "", /noindex/);
  const data = await listing.json() as { templates: unknown[]; canPublish: boolean; deliveryEnabled: boolean };
  assert.equal(data.templates.length, 12); assert.equal(data.canPublish, true); assert.equal(data.deliveryEnabled, false);
  assert.equal((await handleAdminEmailTemplates(request("POST", { action: "preview", id: fixture.id, content: content({ text: "x".repeat(65_000) }) }, auth), env)).status, 400);
  assert.equal((await handleAdminEmailTemplates(request("POST", { action: "sanitize", id: fixture.id, content: content() }, auth, "https://other.example"), env)).status, 403);
  assert.equal((await handleAdminEmailTemplates(request("POST", { action: "sanitize", id: fixture.id, content: content({ html: "x".repeat(65_000) }) }, auth), env)).status, 400);
  assert.equal((await handleAdminEmailTemplates(request("DELETE", undefined, auth), env)).status, 405);
  assert.equal((await handleAdminEmailTemplates(request("GET", undefined, auth, "https://jurisconecta.cl", "?id=not-an-event"), env)).status, 404);
});

test("admins edit drafts, only owner publishes with explicit confirmation, later drafts preserve published copy and history", async () => {
  const env = environment();
  await env.DB.prepare("INSERT INTO github_administrators (github_id, github_login, role, accepted_at) VALUES (1234567, 'email-fixture', 'admin', CURRENT_TIMESTAMP)").run();
  const auth = await adminCookie(env, "email-fixture"), owner = await adminCookie(env);
  assert.equal((await call(env, auth, "save_draft", 0)).status, 200);
  assert.equal((await readEmailTemplate(env.DB, fixture.id)).published, null);
  assert.equal((await call(env, auth, "publish", 1, { confirmPublish: true })).status, 403);
  assert.equal((await call(env, owner, "publish", 1)).status, 403);
  assert.equal((await call(env, owner, "publish", 1, { confirmPublish: true })).status, 200);
  const published = (await readEmailTemplate(env.DB, fixture.id)).published;
  assert.equal((await call(env, auth, "save_draft", 2, { content: content({ subject: "Borrador pendiente distinto" }) })).status, 200);
  let stored = await readEmailTemplate(env.DB, fixture.id);
  assert.deepEqual(stored.published, published); assert.equal(stored.publishedRevision, 2); assert.equal(stored.draft.subject, "Borrador pendiente distinto");
  assert.equal((await call(env, auth, "reset_draft", 3)).status, 200);
  stored = await readEmailTemplate(env.DB, fixture.id); assert.deepEqual(stored.draft, published);
  assert.deepEqual((await readEmailTemplateVersions(env.DB, fixture.id)).map((row) => row.action), ["reset_draft", "save_draft", "publish", "save_draft"]);
  const audit = await env.DB.prepare("SELECT github_login, action FROM admin_audit_log WHERE target_type = 'email_template' ORDER BY rowid").all<{ github_login: string; action: string }>();
  assert.equal(audit.results.length, 4); assert.equal(audit.results[1].github_login, "gprecabarren"); assert.equal(audit.results[1].action, "email_template.publish");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_template_transaction_guards").first<{ n: number }>())?.n, 0);
});

test("optimistic locking is atomic across concurrent first saves and stale revisions do not create history or audit", async () => {
  const env = environment(), auth = await adminCookie(env);
  const responses = await Promise.all(["Primera edición", "Segunda edición"].map((subject) => call(env, auth, "save_draft", 0, { content: content({ subject }) })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await readEmailTemplate(env.DB, fixture.id)).revision, 1);
  assert.equal((await call(env, auth, "save_draft", 0)).status, 409);
  assert.equal((await readEmailTemplateVersions(env.DB, fixture.id)).length, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE target_type = 'email_template'").first<{ n: number }>())?.n, 1);
});

test("preview is read-only and explicitly non-delivery; unpublished templates cannot be prepared as transactional mail", async () => {
  const env = environment(), auth = await adminCookie(env);
  assert.equal((await readEmailTemplates(env.DB)).length, 12);
  const response = await handleAdminEmailTemplates(request("POST", { action: "preview", id: "password-reset", content: EMAIL_TEMPLATE_DEFINITIONS.find((item) => item.id === "password-reset")!.example }, auth), env);
  assert.equal(response.status, 200);
  const data = await response.json() as { preview: { deliveryEnabled: boolean; usesExampleData: boolean; html: string }; document: string };
  assert.equal(data.preview.deliveryEnabled, false); assert.equal(data.preview.usesExampleData, true);
  assert.match(data.document, /Content-Security-Policy/); assert.doesNotMatch(data.preview.html, /token=|secret=|password=/);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_templates").first<{ n: number }>())?.n, 0);
  const safeVisual = await handleAdminEmailTemplates(request("POST", { action: "sanitize", id: fixture.id, content: content({ html: '<p>Texto {{recipient_name}}</p><script>evil()</script><img src="https://evil.example/pixel">' }) }, auth), env);
  assert.equal(safeVisual.status, 200);
  const visual = await safeVisual.json() as { content: EmailTemplateContent; deliveryEnabled: boolean };
  assert.equal(visual.deliveryEnabled, false); assert.match(visual.content.html, /\{\{recipient_name\}\}/); assert.doesNotMatch(visual.content.html, /script|img|evil/);
  await assert.rejects(() => preparePublishedEmail(env.DB, fixture.id, {}), /aún no tiene/);
  assert.equal((await call(env, auth, "save_draft", 0)).status, 200);
  assert.equal((await call(env, auth, "publish", 1, { confirmPublish: true })).status, 200);
  const prepared = await preparePublishedEmail(env.DB, fixture.id, { recipient_name: "Camila Ejemplo", site_name: "JurisConecta", support_email: EMAIL_SENDER_ADDRESS, current_year: "2026", action_url: "https://jurisconecta.cl/cliente/" });
  assert.equal(prepared.status, "delivery_disabled"); assert.equal(prepared.rendered.deliveryEnabled, false); assert.equal(prepared.revision, 2);
});
