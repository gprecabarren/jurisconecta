import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CASE_TYPE_SEED } from "../shared/case-intake-seed";
import { CASE_CATALOG_SUMMARIES, summarizeCaseType } from "../shared/case-catalog-summary";
import { onRequestGet } from "../functions/api/case-types";
import { TestDb } from "./test-db";

test("home summaries retain all stable case identifiers and icons without importing full legal forms", () => {
  assert.deepEqual(CASE_CATALOG_SUMMARIES, CASE_TYPE_SEED.map(summarizeCaseType));
  const component = readFileSync("src/components/case-type-grid.tsx", "utf8");
  assert.equal(component.includes("case-intake-seed"), false);
  assert.equal(component.includes("case-intake-guidance"), false);
});

test("public summaries preserve catalog overrides and omit questions, examples and references", async () => {
  const DB = new TestDb();
  const response = await onRequestGet({ env: { DB }, request: new Request("https://jurisconecta.cl/api/case-types?view=summary") });
  assert.equal(response.status, 200);
  const { types } = await response.json() as { types: Array<Record<string, unknown>> };
  assert.equal(types.length, 78);
  assert.equal(types.some((type) => "steps" in type || "guidance" in type), false);
  assert.ok(JSON.stringify(types).length < JSON.stringify(CASE_TYPE_SEED).length / 3);
});
