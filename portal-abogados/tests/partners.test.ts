import assert from "node:assert/strict";
import test from "node:test";
import { TestDb } from "./test-db";
import { createSession } from "../functions/_lib/github-auth";
import { handleAdminPartners, handlePartnerMedia, handlePublicPartners, validatePartnerImage, validatePartnerMetadata } from "../functions/_lib/partners";
import { partnerLimits, type PartnerAdminData, type PublicPartner } from "../shared/partners";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=";
const metadata = { name: "Colaboración de prueba", category: "company", alt: "Logo de prueba local", linkUrl: "https://example.com/", sortOrder: 1, active: false, authorized: true };
const initial = { ...metadata, imageData: png };
function request(path: string, method = "GET", body?: unknown, cookie = "") {
  return new Request(`https://jurisconecta.cl${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function environment() { return { DB: new TestDb(), AUTH_SESSION_SECRET: "partners-memory-test-not-for-production" }; }
async function cookie(env: ReturnType<typeof environment>) { return `juris_admin=${await createSession("gprecabarren", env, request("/admin"))}`; }

test("home partners validate metadata and real raster structure, never SVG or unsafe links", () => {
  assert.equal(validatePartnerMetadata(metadata).data?.name, metadata.name);
  for (const bad of [{ linkUrl: "javascript:alert(1)" }, { linkUrl: "//example.com/" }, { linkUrl: "https://user:pass@example.com" }, { category: "invented" }, { sortOrder: -1 }, { sortOrder: 1.5 }, { active: "yes" }, { name: "x" }, { alt: "" }]) assert.ok(validatePartnerMetadata({ ...metadata, ...bad }).error);
  assert.equal(validatePartnerImage(png)?.mime, "image/png");
  assert.equal(validatePartnerImage("data:image/svg+xml;base64," + btoa("<svg><script>alert(1)</script></svg>")), null);
  assert.equal(validatePartnerImage(png.replace("image/png", "image/webp")), null);
  assert.equal(validatePartnerImage(png + "AAAA"), null);
  assert.equal(validatePartnerImage("data:image/png;base64," + "A".repeat(70_000)), null);
  const bytes = Uint8Array.from(atob(png.split(",")[1]), (char) => char.charCodeAt(0));
  bytes[16] = 255; // Huge IHDR width, despite a valid PNG signature.
  assert.equal(validatePartnerImage("data:image/png;base64," + btoa(String.fromCharCode(...bytes))), null);
});

test("partners CRUD enforces admin sessions, drafts, versions, audit, private previews and archive restore", async () => {
  const env = environment(), auth = await cookie(env);
  assert.equal((await handleAdminPartners(request("/api/admin/partners"), env)).status, 401);
  const empty = await handlePublicPartners(request("/api/partners"), env);
  assert.deepEqual(await empty.json(), { partners: [] });
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "POST", { ...initial, authorized: false }, auth), env)).status, 400);
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "POST", { ...initial, imageData: undefined }, auth), env)).status, 400);
  const saved = await handleAdminPartners(request("/api/admin/partners", "POST", initial, auth), env);
  assert.equal(saved.status, 200);
  const item = await saved.json() as { id: string; version: number };
  assert.equal((await handlePartnerMedia(request(`/aliados/media/${item.id}?v=1`), env, item.id)).status, 404);
  const preview = `/api/admin/partners?media=1&id=${item.id}&v=1`;
  assert.equal((await handleAdminPartners(request(preview), env)).status, 401);
  const privatePreview = await handleAdminPartners(request(preview, "GET", undefined, auth), env);
  assert.equal(privatePreview.status, 200);
  assert.equal(privatePreview.headers.get("Cache-Control"), "no-store");
  const publish = { ...metadata, ...item, active: true, sortOrder: 4 };
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "PATCH", publish, auth), env)).status, 200);
  const stale = await handleAdminPartners(request("/api/admin/partners", "PATCH", publish, auth), env);
  assert.equal(stale.status, 409);
  const publicData = await (await handlePublicPartners(request("/api/partners"), env)).json() as { partners: PublicPartner[] };
  assert.equal(publicData.partners.length, 1); assert.equal(publicData.partners[0].version, 2);
  assert.equal(JSON.stringify(publicData).includes("data_base64"), false);
  assert.equal(JSON.stringify(publicData).includes("updatedBy"), false);
  const media = await handlePartnerMedia(request(`/aliados/media/${item.id}?v=2`), env, item.id);
  assert.equal(media.status, 200); assert.equal(media.headers.get("Content-Type"), "image/png");
  assert.equal(media.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(media.headers.get("Cache-Control") || "", /immutable/);
  const cached = new Request(`https://jurisconecta.cl/aliados/media/${item.id}?v=2`, { headers: { "If-None-Match": media.headers.get("ETag")! } });
  assert.equal((await handlePartnerMedia(cached, env, item.id)).status, 304);
  assert.equal((await handlePartnerMedia(request(`/aliados/media/${item.id}?v=1`), env, item.id)).status, 404);
  const archived = await handleAdminPartners(request("/api/admin/partners", "PATCH", { id: item.id, version: 2, action: "archive" }, auth), env);
  assert.equal(archived.status, 200);
  assert.equal((await handlePartnerMedia(request(`/aliados/media/${item.id}?v=2`), env, item.id)).status, 404);
  const listing = await (await handleAdminPartners(request("/api/admin/partners", "GET", undefined, auth), env)).json() as PartnerAdminData;
  assert.equal(listing.partners[0].archived, true); assert.equal(listing.storageBytes, 0);
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "PATCH", { ...metadata, id: item.id, version: 3 }, auth), env)).status, 400);
  // Ordinary accepted administrators can manage content, without gaining owner permissions.
  await env.DB.prepare("INSERT INTO github_administrators (github_id, github_login, role, accepted_at) VALUES (123456, 'content-admin-fixture', 'admin', CURRENT_TIMESTAMP)").run();
  const contentAuth = `juris_admin=${await createSession("content-admin-fixture", env, request("/admin"))}`;
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "PATCH", { ...initial, id: item.id, version: 3, active: true, category: "law_firm" }, contentAuth), env)).status, 200);
  const audit = await env.DB.prepare("SELECT action, details_json FROM admin_audit_log WHERE target_id = ? ORDER BY rowid").bind(item.id).all<{ action: string; details_json: string }>();
  assert.deepEqual(audit.results.map((row) => row.action), ["partners.create", "partners.update", "partners.archive", "partners.restore"]);
  assert.equal(JSON.stringify(audit).includes("base64"), false);
  await env.DB.prepare("UPDATE github_administrators SET status = 'revoked' WHERE github_login = 'gprecabarren'").run();
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "GET", undefined, auth), env)).status, 401);
});

test("partners have strict count and storage quotas; retired slots can be reused without growing D1", async () => {
  const env = environment(), auth = await cookie(env);
  let firstId = "";
  for (let i = 0; i < partnerLimits.count; i++) {
    const response = await handleAdminPartners(request("/api/admin/partners", "POST", { ...initial, name: `Prueba local ${i}` }, auth), env);
    assert.equal(response.status, 200);
    const result = await response.json() as { id: string }; if (!firstId) firstId = result.id;
  }
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "POST", initial, auth), env)).status, 413);
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "PATCH", { id: firstId, version: 1, action: "archive" }, auth), env)).status, 200);
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "PATCH", { ...initial, id: firstId, version: 2 }, auth), env)).status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM home_partners").first<{ n: number }>())?.n, 40);
  const quotaEnv = environment(), quotaAuth = await cookie(quotaEnv);
  // Exercise the database's storage trigger directly with metadata-only local fixtures.
  // These synthetic bytes are not uploaded to or served by any real site.
  for (let i = 0; i < 32; i++) await quotaEnv.DB.prepare("INSERT INTO home_partners (id, name, category, alt, data_base64, mime_type, byte_size, storage_size, updated_by) VALUES (?, 'Quota fixture', 'company', 'Local quota fixture', ?, 'image/png', 49152, 65536, 'local-test')").bind(crypto.randomUUID(), "A".repeat(65536)).run();
  assert.equal((await handleAdminPartners(request("/api/admin/partners", "POST", initial, quotaAuth), quotaEnv)).status, 413);
  const count = await quotaEnv.DB.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'partners.create'").first<{ n: number }>();
  assert.equal(count?.n, 0);
});

test("partner image endpoints reject invalid identifiers, versions and methods without leaking draft metadata", async () => {
  const env = environment(), id = crypto.randomUUID();
  assert.equal((await handlePartnerMedia(request("/aliados/media/not-a-uuid?v=1"), env, "not-a-uuid")).status, 404);
  assert.equal((await handlePartnerMedia(request(`/aliados/media/${id}`), env, id)).status, 404);
  assert.equal((await handlePartnerMedia(request(`/aliados/media/${id}?v=0`), env, id)).status, 404);
  assert.equal((await handlePartnerMedia(request(`/aliados/media/${id}?v=1`, "POST", {}), env, id)).status, 405);
  assert.equal((await handlePublicPartners(request("/api/partners", "POST", {}), env)).status, 405);
});
