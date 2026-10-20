import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAND, type BrandLogoVariant } from "../shared/brand";
import { BrandLogo } from "../src/components/brand-logo";
import { createSession } from "../functions/_lib/github-auth";
import worker from "../src/worker";
import { TestDb } from "./test-db";

const variants = Object.keys(BRAND.logos) as BrandLogoVariant[];
const brandAssetPaths = [
  "/brand/logo-principal-firma.svg", "/brand/logo-principal-horizontal.svg", "/brand/logo-principal-vertical.svg", "/brand/logo-email.png",
  "/favicon.svg", "/favicon.ico", "/favicon-32.png", "/favicon-48.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png",
  "/site.webmanifest", "/icon.svg", "/og-jurisconecta.png",
];

function pngDimensions(bytes: Buffer) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "PNG signature");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(8), 13, "IHDR byte length");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("official logos retain vector masks and outlined lettering without executable content or external resources", () => {
  for (const variant of variants) {
    const asset = BRAND.logos[variant];
    const svg = readFileSync(`public${asset.src}`, "utf8");
    assert.match(svg, /<svg\b/);
    assert.match(svg, new RegExp(`width="${asset.width}"`));
    assert.match(svg, new RegExp(`height="${asset.height}"`));
    assert.match(svg, /<path\b/);
    assert.match(svg, /#D8BD83/i);
    assert.doesNotMatch(svg, /<(?:script|foreignObject|iframe|image|text|font)\b|\son[a-z]+\s*=|@font-face|font-family|@import|<!DOCTYPE|<!ENTITY/i, variant);
    for (const match of svg.matchAll(/(?:href|xlink:href)\s*=\s*["']([^"']*)["']/gi)) assert.match(match[1], /^#[\w.-]+$/, `${variant} uses only local references`);
    for (const match of svg.matchAll(/url\(([^)]+)\)/gi)) assert.match(match[1], /^#[\w.-]+$/, `${variant} uses only local masks`);
    if (variant !== "signature") {
      const maskId = variant === "horizontal" ? "jc-mask-01-principal-horizontal" : "jc-mask-01-principal";
      assert.match(svg, new RegExp(`<mask id="${maskId}" maskUnits="userSpaceOnUse"`));
      assert.ok(svg.includes('style="mask-type:luminance"'), "original luminance mask retained");
      assert.ok(svg.includes(`mask="url(#${maskId})"`), "artwork still consumes its mask");
      assert.ok(svg.indexOf("</mask>") > svg.indexOf("<mask"));
    }
  }
});

test("BrandLogo server rendering uses first-party variants, intrinsic dimensions and accessible loading options", () => {
  for (const variant of variants) {
    const asset = BRAND.logos[variant];
    const html = renderToStaticMarkup(createElement(BrandLogo, { variant }));
    assert.ok(html.includes(`class="brand-logo brand-logo--${variant}"`));
    assert.ok(html.includes(`src="${asset.src}"`));
    assert.ok(html.includes(`width="${asset.width}"`));
    assert.ok(html.includes(`height="${asset.height}"`));
    assert.match(html, /alt="JurisConecta"/);
    assert.match(html, /decoding="async"/);
    assert.match(html, /loading="eager"/);
    assert.doesNotMatch(html, /<svg|<script|<span/);
  }
  const decorative = renderToStaticMarkup(createElement(BrandLogo, { variant: "horizontal", decorative: true, loading: "lazy", className: "example" }));
  assert.match(decorative, /alt=""/);
  assert.match(decorative, /loading="lazy"/);
  assert.match(decorative, /brand-logo--horizontal example/);
  const hero = renderToStaticMarkup(createElement(BrandLogo, { variant: "vertical", fetchPriority: "high" }));
  assert.match(hero, /fetchPriority="high"/i);
});

test("all site identity surfaces use the official component instead of the generic scales logo", () => {
  const surfaces = [
    "src/components/public-chrome.tsx", "src/components/portal-shell.tsx", "src/components/client-shell.tsx", "src/components/registration-form.tsx",
    "src/app/ingresar/page.tsx", "src/app/mantenimiento/page.tsx", "src/app/page.tsx",
  ];
  for (const path of surfaces) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /<BrandLogo\b/, path);
    assert.doesNotMatch(source, /<Scale\b|className="brand-mark"|Juris<strong>Conecta<\/strong>/, path);
  }
  const publicChrome = readFileSync(surfaces[0], "utf8");
  assert.match(publicChrome, /<BrandLogo variant="horizontal" decorative loading="lazy"/);
  assert.match(readFileSync("src/app/page.tsx", "utf8"), /hero-brand-visual[\s\S]*<BrandLogo variant="vertical" fetchPriority="high"/);
  const favicon = readFileSync("public/favicon.svg", "utf8");
  assert.equal(readFileSync("src/app/icon.svg", "utf8").trim(), favicon.trim(), "Next icon and classic favicon share the official monogram");
  assert.doesNotMatch(favicon, /M32 12v38M17 19h30/);
});

test("favicons, app icons, email logo and social card have valid PNG or ICO headers and expected dimensions", () => {
  for (const [path, size] of [["favicon-32.png", 32], ["favicon-48.png", 48], ["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]] as const) {
    assert.deepEqual(pngDimensions(readFileSync(`public/${path}`)), { width: size, height: size }, path);
  }
  assert.deepEqual(pngDimensions(readFileSync("public/og-jurisconecta.png")), { width: 1200, height: 630 });
  assert.deepEqual(pngDimensions(readFileSync("public/brand/logo-email.png")), { width: 670, height: 200 });
  const ico = readFileSync("public/favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1, "ICO image type");
  const count = ico.readUInt16LE(4);
  assert.ok(count > 0 && count <= 10);
  const sizes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = ico[entry] || 256, height = ico[entry + 1] || 256;
    const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.equal(width, height);
    assert.ok(length > 0 && offset >= 6 + count * 16 && offset + length <= ico.length, "ICO image bounds");
    sizes.push(width);
  }
  assert.ok(sizes.includes(32), "contains browser-sized 32 px icon");
});

test("installable manifest uses the official name, palette and local app icons", () => {
  const manifest = JSON.parse(readFileSync("public/site.webmanifest", "utf8")) as { name: string; short_name: string; start_url: string; background_color: string; theme_color: string; icons: Array<{ src: string; sizes: string; type: string }> };
  assert.equal(manifest.name, BRAND.name);
  assert.equal(manifest.short_name, BRAND.name);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.background_color, BRAND.colors.background);
  assert.equal(manifest.theme_color, BRAND.colors.background);
  assert.deepEqual(manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })), [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ]);
});

function maintenanceFixture() {
  const mime: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
  // This isolated in-memory binding never contacts Cloudflare or a production account.
  return { DB: new TestDb(), AUTH_SESSION_SECRET: "brand-maintenance-fixture-only", USER_AUTH_SECRET: "brand-maintenance-user-fixture", ASSETS: { fetch: async (request: Request) => {
    const path = new URL(request.url).pathname;
    return new Response(request.method === "HEAD" ? null : `Fixture asset ${path}`, { headers: { "Content-Type": mime[extname(path)] || "text/html", "X-Fixture-Asset": path } });
  } } } as unknown as Parameters<typeof worker.fetch>[1];
}
const siteRequest = (path: string, method = "GET", cookie = "") => new Request(`https://jurisconecta.cl${path}`, { method, headers: { Cookie: cookie } });

test("maintenance keeps only exact official identity assets available without exposing unknown brand paths", async () => {
  const env = maintenanceFixture();
  await env.DB.prepare("UPDATE site_settings SET maintenance_enabled = 1 WHERE id = 1").run();
  for (const path of brandAssetPaths) {
    for (const method of ["GET", "HEAD"]) {
      const response = await worker.fetch(siteRequest(path, method), env);
      assert.equal(response.status, 200, `${method} ${path}`);
      assert.equal(response.headers.get("X-Fixture-Asset"), path, "requested resource, not the maintenance HTML");
    }
  }
  for (const path of ["/brand/no-existe", "/brand/no-existe.svg", "/brand/logo-principal-firma.svg/extra", "/brand/logo-email.png.old", "/favicon.svg/extra"]) {
    const response = await worker.fetch(siteRequest(path), env);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("X-Robots-Tag") || "", /noindex/);
    assert.match(await response.text(), /Fixture asset \/mantenimiento\//);
  }
});

test("maintenance brand exceptions do not weaken private-page or API protections", async () => {
  const env = maintenanceFixture();
  await env.DB.prepare("UPDATE site_settings SET maintenance_enabled = 1 WHERE id = 1").run();
  const tickets = await worker.fetch(siteRequest("/api/tickets"), env);
  assert.equal(tickets.status, 503);
  assert.equal(tickets.headers.get("Cache-Control"), "no-store");
  assert.match(tickets.headers.get("X-Robots-Tag") || "", /noindex/);
  assert.match((await tickets.json() as { error: string }).error, /mantenimiento/);
  const anonymousPage = await worker.fetch(siteRequest("/admin/correos/"), env);
  assert.equal(anonymousPage.status, 302);
  assert.match(anonymousPage.headers.get("Location") || "", /\/auth\/github\/login/);
  assert.equal(anonymousPage.headers.get("Cache-Control"), "no-store");
  assert.match(anonymousPage.headers.get("X-Robots-Tag") || "", /noindex/);
  const anonymousApi = await worker.fetch(siteRequest("/api/admin/email-templates"), env);
  assert.equal(anonymousApi.status, 401);
  assert.match(anonymousApi.headers.get("X-Robots-Tag") || "", /noindex/);
  const ownerCookie = `juris_admin=${await createSession("gprecabarren", env, siteRequest("/admin/"))}`;
  const ownerPage = await worker.fetch(siteRequest("/admin/correos/", "GET", ownerCookie), env);
  assert.equal(ownerPage.status, 200);
  assert.equal(ownerPage.headers.get("Cache-Control"), "no-store");
  assert.match(ownerPage.headers.get("X-Robots-Tag") || "", /noindex/);
});
