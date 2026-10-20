import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicHeader } from "../src/components/public-chrome";

test("desktop social row follows navigation and actions, while mobile retains its own social group", () => {
  const html = renderToStaticMarkup(createElement(PublicHeader, {
    home: true,
    socialLinks: [{ id: "official-instagram", platform: "instagram", url: "https://www.instagram.com/jurisconecta/" }],
    contactEmail: "jurisconecta.site@gmail.com",
  }));
  assert.match(html, /class="public-main-nav" aria-label="Navegación principal"/);
  assert.match(html, /class="public-header-right"><div class="header-actions">/);
  const row = html.indexOf('class="public-header-social-row"');
  assert.ok(row > html.indexOf("</details>"), "desktop social row is separate from actions and mobile menu");
  assert.match(html.slice(row), /class="site-social-links site-social-links-header"/);
  assert.equal((html.match(/class="site-social-links site-social-links-header"/g) || []).length, 2);
  assert.equal((html.match(/href="https:\/\/www.instagram.com\/jurisconecta\/"/g) || []).length, 2);
  assert.equal((html.match(/href="mailto:jurisconecta.site@gmail.com"/g) || []).length, 2);
  assert.match(html, /href="#casos"/);
  assert.match(html, /class="public-mobile-menu" data-navigation-menu="true"/);
});

test("hero no longer paints the vertical pseudo-element and desktop social layout is breakpoint scoped", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.doesNotMatch(css, /\.hero::after\s*\{/);
  assert.match(css, /\.hero::before\s*\{/);
  assert.match(css, /\.public-header-social-row\s*\{\s*display:\s*none;/);
  const desktop = css.slice(css.indexOf("/* Desktop keeps navigation/actions"));
  assert.match(desktop, /@media\s*\(min-width:\s*1181px\)/);
  assert.match(desktop, /\.public-header-social-row\s*\{\s*display:\s*flex;/);
  assert.match(desktop, /grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/);
  assert.match(desktop, /\.public-site-header \.public-main-nav\s*\{[^}]*grid-column:\s*2;[^}]*margin-left:\s*0;/);
  assert.match(desktop, /\.public-header-social-row\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;[^}]*justify-content:\s*flex-start;/);
  assert.match(desktop, /#como-funciona, #casos, #confianza\s*\{\s*scroll-margin-top:\s*136px;/);
});
