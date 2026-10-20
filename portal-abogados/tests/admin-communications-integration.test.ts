import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { createSession } from "../functions/_lib/github-auth";
import worker from "../src/worker";

function environment() {
  // Only this local adapter narrows D1/static bindings; no production credential or network is used.
  return { DB: new TestDb(), AUTH_SESSION_SECRET: "communications-integration-fixture-only", USER_AUTH_SECRET: "communications-integration-users-fixture", ASSETS: { fetch: async () => new Response("Fixture private page", { headers: { "Content-Type": "text/html" } }) } } as unknown as Parameters<typeof worker.fetch>[1];
}
function request(path: string, method = "GET", body?: unknown, cookie = "", origin = "https://jurisconecta.cl") {
  return new Request(`https://jurisconecta.cl${path}`, { method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test("communications and support API routes require authorization and are never indexed or cached", async () => {
  const env = environment();
  for (const path of ["/api/admin/email-templates", "/api/admin/tickets?alertsOnly=1", "/api/tickets"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("X-Robots-Tag") || "", /noindex/);
  }
  const rejected = await worker.fetch(request("/api/admin/email-templates", "PATCH", { action: "save_draft" }, "", "https://other.example.test"), env);
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("Cache-Control"), "no-store");
  assert.match(rejected.headers.get("X-Robots-Tag") || "", /noindex/);
});

test("email editor page stays private, including maintenance and method guards", async () => {
  const env = environment();
  const anonymous = await worker.fetch(request("/admin/correos/"), env);
  assert.equal(anonymous.status, 302);
  assert.match(anonymous.headers.get("Location") || "", /auth\/github\/login/);
  assert.equal(anonymous.headers.get("Cache-Control"), "no-store");
  assert.match(anonymous.headers.get("X-Robots-Tag") || "", /noindex/);
  const owner = `juris_admin=${await createSession("gprecabarren", env, request("/admin/"))}`;
  await env.DB.prepare("UPDATE site_settings SET maintenance_enabled = 1 WHERE id = 1").run();
  const page = await worker.fetch(request("/admin/correos/", "GET", undefined, owner), env);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("X-Robots-Tag") || "", /noindex/);
  assert.equal((await worker.fetch(request("/api/admin/email-templates", "DELETE", undefined, owner), env)).status, 405);
});
