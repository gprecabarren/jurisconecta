import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/app/globals.css", "utf8");
const system = css.slice(css.indexOf("/* Shared interaction language:"));

test("shared motion is opt-in, pointer hover is guarded, and destructive/provider identity stays separate", () => {
  assert.match(system, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(system, /:not\(:disabled, \[aria-disabled="true"\], \[aria-busy="true"\], fieldset:disabled \*\):hover/);
  assert.match(system, /\.client-case-actions \.portal-outline-button \{[^}]*color: #f0b5a1;[^}]*background-image: linear-gradient\(#4a2926/);
  assert.match(system, /\.portal-danger-button:is\(:disabled,[^}]*background: #8f3838;/);
  assert.match(system, /\.google-button:focus-visible \{ outline-color: #75551c;/);
  assert.doesNotMatch(system, /(?:^|\n)button\s*\{[^}]*background:/);
});

test("reduced motion removes smooth scrolling, hover movement and delays without hiding content", () => {
  const reduced = system.slice(system.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /html \{ scroll-behavior: auto;/);
  assert.match(reduced, /transition-duration: 0s !important; transition-delay: 0s !important;/);
  assert.match(reduced, /reveal-visible \{ opacity: 1; transform: none;/);
  assert.match(reduced, /\.case-list-card, \.plan-card/);
  assert.match(css, /\[data-reveal\]:focus-within \{ opacity: 1; transform: none; transition: none;/);
  assert.doesNotMatch(css, /\[data-reveal\]\s*\{[^}]*opacity:\s*0/);
});

test("local action families retain motion guards and catalog counter inherits filled-button contrast", () => {
  for (const stylesheet of ["billing", "case-type-grid", "case-intake-form", "case-intake-wizard", "admin-case-types", "admin-email-templates", "admin-support-alerts", "partners-carousel", "support-operations"]) {
    const moduleCss = readFileSync(`src/components/${stylesheet}.module.css`, "utf8");
    assert.match(moduleCss, /prefers-reduced-motion: reduce/, stylesheet);
    assert.match(moduleCss, /fieldset:disabled \*/, stylesheet);
    assert.match(moduleCss, /hover: hover/, stylesheet);
  }
  const catalog = readFileSync("src/components/case-type-grid.module.css", "utf8");
  assert.match(catalog, /\.more span \{ color: inherit;/);
});

test("long action labels can wrap and catalog copy keeps a responsive breathing gap", () => {
  assert.match(system, /:is\(\.primary-button, \.secondary-button\) \{[^}]*max-width: 100%;[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  assert.match(system, /\.hero-points li \{ align-items: flex-start; line-height: 1\.55;/);
  const catalog = readFileSync("src/components/case-type-grid.module.css", "utf8");
  assert.match(catalog, /\.catalog \{[^}]*margin-top: clamp\(26px, 3vw, 36px\);/);
  assert.match(catalog, /\.cardText \{ line-height: 1\.55;/);
});
