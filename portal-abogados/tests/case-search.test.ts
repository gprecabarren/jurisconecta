import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCaseSearch, searchCaseTypes } from "../shared/case-search";
import { CASE_CATALOG_SUMMARIES } from "../shared/case-catalog-summary";

const types = [
  { id: "familia", topic: "Violencia intrafamiliar", category: "Derecho Familiar", searchKeywords: ["golpes", "golpes de pareja", "maltrato en casa"] },
  { id: "penal", topic: "Agresiones y riñas", category: "Derecho Penal", searchKeywords: ["golpes", "pelea", "agresión"] },
  { id: "laboral", topic: "Despido injustificado", category: "Derecho Laboral", searchKeywords: ["me despidieron", "me echaron del trabajo"] },
  { id: "salud", topic: "Licencia médica", category: "Derecho Laboral", searchKeywords: [] },
];

test("common words, phrases, accents, case and partial input find appropriate catalog alternatives", () => {
  assert.deepEqual(searchCaseTypes(types, "GÓLPES").map((type) => type.id), ["familia", "penal"]);
  assert.deepEqual(searchCaseTypes(types, "golp").map((type) => type.id), ["familia", "penal"]);
  assert.deepEqual(searchCaseTypes(types, "golpes de pareja").map((type) => type.id), ["familia"]);
  assert.deepEqual(searchCaseTypes(types, "me despidieron").map((type) => type.id), ["laboral"]);
  assert.deepEqual(searchCaseTypes(types, "LICENCIA MÉDICA").map((type) => type.id), ["salud"]);
  assert.deepEqual(searchCaseTypes(types, "agres").map((type) => type.id), ["penal"]);
});

test("the shipped catalog connects everyday expressions to its actual legal topics", () => {
  for (const [query, expectedId] of [["golpes", "violencia-intrafamiliar"], ["golpes", "agresiones-y-rinas"], ["me echaron", "despido-injustificado"], ["no me pagan", "defensa-de-derechos-laborales"], ["herencia", "herencias-y-posesiones-efectivas"], ["arriendo", "compra-y-arriendo-de-propiedades"]]) {
    assert.ok(searchCaseTypes(CASE_CATALOG_SUMMARIES, query).some((type) => type.id === expectedId), query);
  }
});

test("exact titles rank first, matching token prefixes avoids arbitrary mid-word hits, and ties preserve catalog order", () => {
  const ranked = [...types, { id: "exacto", topic: "Golpes", category: "Otros casos", searchKeywords: [] }];
  assert.equal(searchCaseTypes(ranked, "golpes")[0].id, "exacto");
  assert.deepEqual(searchCaseTypes(types, "laboral").map((type) => type.id), ["laboral", "salud"]);
  assert.equal(searchCaseTypes(types, "olpes").length, 0);
  assert.equal(searchCaseTypes(types, "golpes trabajo").length, 0);
});

test("empty or punctuation-only input returns a copy without mutating the catalog, and old definitions remain searchable", () => {
  const before = JSON.stringify(types), result = searchCaseTypes(types, "   ");
  assert.deepEqual(result, types);
  assert.notEqual(result, types);
  assert.deepEqual(searchCaseTypes(types, "[.*]"), types);
  assert.equal(normalizeCaseSearch("  VIOLÉNCIA---familiar! "), "violencia familiar");
  assert.equal(searchCaseTypes([{ topic: "Divorcio", category: "Familia" }], "divor").length, 1);
  assert.equal(JSON.stringify(types), before);
  assert.equal(searchCaseTypes(types, "palabra-inexistente").length, 0);
});

test("query length is bounded and visibility is chosen by the caller rather than hidden implicitly", () => {
  assert.deepEqual(searchCaseTypes(types, `golpes${" ".repeat(114)}nunca`), searchCaseTypes(types, "golpes"));
  assert.equal(searchCaseTypes([{ topic: "Oculto", category: "Prueba", enabled: false }], "oculto").length, 1);
});

test("public search is visible before expanding, accessible, local-only and separated from the cards", () => {
  const source = readFileSync("src/components/case-type-grid.tsx", "utf8");
  assert.match(source, /role="search"/);
  assert.match(source, /htmlFor=\{searchId\}/);
  assert.match(source, /maxLength=\{120\}/);
  assert.match(source, /aria-controls=\{resultsId\}/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /data-reveal=\{hasSearch \? undefined : true\}/, "interactive results must not wait for a scroll reveal");
  assert.match(source, /!expanded && !hasSearch \? filtered\.slice\(0, 18\) : filtered/);
  assert.doesNotMatch(source, /expanded \|\| !compact \? <label/);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage|URLSearchParams|gtag|dataLayer)/);
  assert.match(readFileSync("src/components/case-type-grid.module.css", "utf8"), /margin-top: clamp\(36px, 4vw, 52px\)/);
});
