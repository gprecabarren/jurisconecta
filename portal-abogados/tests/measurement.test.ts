import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/measurement.js", import.meta.url), "utf8");

async function measurement(pathname: string, allowed: boolean | null) {
  const appended: Array<{ src?: string }> = [], events: Array<Record<string, unknown>> = [], navigations: string[] = [], timers: Array<() => void> = [];
  const listeners: Record<string, (event: unknown) => void> = {};
  const control = () => ({ hidden: false, className: "", innerHTML: "", textContent: "", setAttribute() {}, focus() {}, addEventListener() {}, querySelector: () => control() });
  class Element { constructor(public href: string) {} closest() { return this; } hasAttribute() { return false; } target = ""; }
  runInNewContext(source, {
    URL, URLSearchParams, Element, Date, JSON,
    location: { origin: "https://jurisconecta.cl", hostname: "jurisconecta.cl", pathname, search: "", assign: (href: string) => navigations.push(href), reload() {} },
    document: { title: "Noticias", referrer: "https://jurisconecta.cl/noticias/?email=never-send", cookie: "", createElement: () => control(), body: { appendChild() {} }, head: { appendChild: (value: { src?: string }) => appended.push(value) }, addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; } },
    localStorage: { getItem: () => allowed === null ? null : JSON.stringify({ allowed, at: Date.now() }), setItem() {} },
    window: { dataLayer: { push: (value: Record<string, unknown>) => { events.push(value); } } },
    fetch: async () => ({ ok: true, json: async () => ({ gtmId: "GTM-PR9DGQR2" }) }),
    setTimeout: (callback: () => void) => timers.push(callback),
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { appended, events, navigations, timers, click: (href: string) => listeners.click?.({ target: new Element(href), button: 0, preventDefault() {}, stopImmediatePropagation() {} }) };
}

test("analytics never loads without consent or on private pages", async () => {
  for (const [path, consent] of [["/noticias/", null], ["/noticias/", false], ["/ingresar/", true], ["/registro/google/", true], ["/cliente/caso/", true]] as const) {
    const result = await measurement(path, consent);
    assert.equal(result.appended.length, 0);
    assert.equal(result.events.length, 0);
  }
});

test("consented public navigation sends only an enum and cannot be blocked by tags", async () => {
  const result = await measurement("/noticias/", true);
  assert.equal(result.appended[0].src, "https://www.googletagmanager.com/gtm.js?id=GTM-PR9DGQR2");
  const page = result.events.find((value) => value.event === "jc_page_view")!;
  assert.equal(page.jc_page_referrer, "https://jurisconecta.cl/noticias/");
  result.click("https://jurisconecta.cl/registro/");
  const action = result.events.find((value) => value.event === "jc_public_action")!;
  assert.equal(action.jc_action, "register_start");
  assert.equal(action.eventTimeout, 400);
  assert.equal(result.navigations.length, 0);
  result.timers.forEach((callback) => callback());
  (action.eventCallback as () => void)();
  assert.deepEqual(result.navigations, ["https://jurisconecta.cl/registro/"]);
  assert.equal(JSON.stringify(result.events).includes("never-send"), false);
});
