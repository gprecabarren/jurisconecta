import assert from "node:assert/strict";
import test from "node:test";
import { isNewsImage, sanitizeNews, slugify, validateNews } from "../functions/_lib/news";
import { oauthHash, randomOAuthToken, validGoogleClaims } from "../functions/_lib/google-auth";

test("editorial HTML strips executable markup and unsafe URLs", () => {
  const output = sanitizeNews('<h1>Título</h1><p onclick="alert(1)">Texto<script>alert(1)</script></p><iframe src="https://evil.example"></iframe><img src="https://evil.example/a.png" onerror="alert(1)"><a href="javascript:alert(1)">A</a><a href="//evil.example">B</a><a href="https://example.com">C</a>');
  assert.equal(/script|iframe|onclick|onerror|javascript|evil\.example|<h1/.test(output), false);
  assert.match(output, /rel="noopener noreferrer"/);
});
test("editorial images and canonical URLs remain first-party", () => {
  assert.equal(isNewsImage("/og-jurisconecta.png"), true);
  assert.equal(isNewsImage("https://jurisconecta.cl/og-jurisconecta.png"), false);
  assert.equal(isNewsImage("//evil.example/x"), false);
  const body = { title: "Cómo encontrar un abogado", excerpt: "Una guía útil para preparar tu primera consulta con información clara.", content_html: "<p>" + "Información práctica y original. ".repeat(6) + "</p>", status: "published" };
  assert.equal(validateNews({ ...body, canonical_url: "https://evil.example/" }).error?.includes("canónica"), true);
  assert.equal(validateNews(body).data?.slug, "como-encontrar-un-abogado");
  assert.equal(slugify("Áreas & Abogados/Chile"), "areas-abogados-chile");
});
test("Google claims require the exact nonce and verified email", () => {
  const payload = { sub: "123", email: "test@example.com", email_verified: true, nonce: "expected" };
  assert.equal(validGoogleClaims(payload, "expected"), true);
  assert.equal(validGoogleClaims(payload, "wrong"), false);
  assert.equal(validGoogleClaims({ ...payload, email_verified: false }, "expected"), false);
  assert.equal(validGoogleClaims({ ...payload, sub: "" }, "expected"), false);
  assert.equal(validGoogleClaims({ ...payload, email: "not-an-email" }, "expected"), false);
});
test("OAuth secrets are random 256-bit tokens and PKCE uses SHA-256", async () => {
  const a = randomOAuthToken(), b = randomOAuthToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(await oauthHash("test"), "n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg");
});
