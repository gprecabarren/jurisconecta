import assert from "node:assert/strict";
import test from "node:test";
import { mountScrollReveal } from "../src/lib/scroll-reveal-controller";

class FakeElement {
  readonly nodeType = 1;
  readonly children: FakeElement[] = [];
  readonly classes = new Set<string>();
  readonly classList = {
    add: (...tokens: string[]) => tokens.forEach((token) => this.classes.add(token)),
    remove: (...tokens: string[]) => tokens.forEach((token) => this.classes.delete(token)),
    contains: (token: string) => this.classes.has(token),
  };
  parent?: FakeElement;
  root = false;
  hasReveal = true;
  constructor(readonly top = 1_000, readonly hero = false) {}
  get isConnected(): boolean { return this.root || !!this.parent?.isConnected; }
  matches(selector: string) { assert.equal(selector, "[data-reveal]"); return this.hasReveal; }
  getBoundingClientRect() { return { top: this.top }; }
  contains(target: unknown): boolean { return target === this || this.children.some((child) => child.contains(target)); }
  closest(selector: string): FakeElement | null {
    assert.equal(selector, ".hero");
    return this.hero ? this : this.parent?.closest(selector) ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  append(child: FakeElement) { child.parent = this; this.children.push(child); return child; }
  detach() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); this.parent = undefined; }
}

function harness(options: { reduced?: boolean; noIO?: boolean; throwConstructor?: boolean; throwObserve?: boolean; legacyMedia?: boolean } = {}) {
  const root = new FakeElement(0);
  root.root = true;
  root.hasReveal = false;
  const focusListeners = new Set<(event: { target: FakeElement }) => void>();
  const motionListeners = new Set<(event: { matches: boolean }) => void>();
  const document = {
    documentElement: root,
    activeElement: null as FakeElement | null,
    querySelectorAll: (selector: string) => root.querySelectorAll(selector),
    addEventListener: (name: string, listener: (event: { target: FakeElement }) => void) => { assert.equal(name, "focusin"); focusListeners.add(listener); },
    removeEventListener: (_name: string, listener: (event: { target: FakeElement }) => void) => focusListeners.delete(listener),
  };
  const media = {
    matches: options.reduced ?? false,
    addEventListener: options.legacyMedia ? undefined : (_name: string, listener: (event: { matches: boolean }) => void) => motionListeners.add(listener),
    removeEventListener: options.legacyMedia ? undefined : (_name: string, listener: (event: { matches: boolean }) => void) => motionListeners.delete(listener),
    addListener: (listener: (event: { matches: boolean }) => void) => motionListeners.add(listener),
    removeListener: (listener: (event: { matches: boolean }) => void) => motionListeners.delete(listener),
  };
  const observers: FakeIntersectionObserver[] = [];
  class FakeIntersectionObserver {
    readonly observed = new Set<FakeElement>();
    disconnected = false;
    constructor(readonly callback: (entries: Partial<IntersectionObserverEntry>[]) => void, readonly config: IntersectionObserverInit) {
      if (options.throwConstructor) throw new Error("observer unavailable");
      observers.push(this);
    }
    observe(element: FakeElement) {
      if (options.throwObserve) throw new Error("observation failed");
      this.observed.add(element);
    }
    unobserve(element: FakeElement) { this.observed.delete(element); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    enter(element: FakeElement, ratio = 0.5) {
      this.callback([{ target: element as unknown as Element, isIntersecting: true, intersectionRatio: ratio }]);
    }
  }
  const mutationObservers: FakeMutationObserver[] = [];
  class FakeMutationObserver {
    disconnected = false;
    config?: MutationObserverInit;
    constructor(readonly callback: (records: Partial<MutationRecord>[]) => void) { mutationObservers.push(this); }
    observe(_element: FakeElement, config: MutationObserverInit) { this.config = config; }
    disconnect() { this.disconnected = true; }
    added(node: FakeElement) { this.callback([{ type: "childList", addedNodes: [node] as unknown as NodeList }]); }
    attribute(node: FakeElement) { this.callback([{ type: "attributes", target: node as unknown as Node }]); }
  }
  const environment = {
    innerHeight: 800,
    matchMedia: () => media as unknown as MediaQueryList,
    IntersectionObserver: options.noIO ? undefined : FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    MutationObserver: FakeMutationObserver as unknown as typeof MutationObserver,
  };
  return {
    root, document, observers, mutationObservers, focusListeners, motionListeners,
    mount: () => mountScrollReveal(document as unknown as Document, environment),
    focus: (target: FakeElement) => focusListeners.forEach((listener) => listener({ target })),
    motion: (matches: boolean) => { media.matches = matches; motionListeners.forEach((listener) => listener({ matches })); },
  };
}

function assertVisible(element: FakeElement) {
  assert.equal(element.classes.has("reveal-pending"), false);
  assert.equal(element.classes.has("reveal-visible"), true);
}

test("progressive reveal leaves the first viewport, earlier content and hero/LCP visible", () => {
  const h = harness();
  const firstViewport = h.root.append(new FakeElement(799));
  const previouslyScrolled = h.root.append(new FakeElement(-500));
  const hero = h.root.append(new FakeElement(900, true));
  const heroImage = hero.append(new FakeElement(1_100));
  const belowFold = h.root.append(new FakeElement(950));
  assert.deepEqual([...belowFold.classes], [], "SSR/static content has no hidden class");
  const cleanup = h.mount();
  for (const element of [firstViewport, previouslyScrolled, hero, heroImage]) assertVisible(element);
  assert.equal(belowFold.classes.has("reveal-pending"), true);
  assert.deepEqual([...h.observers[0].observed], [belowFold]);
  assert.deepEqual(h.observers[0].config, { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });
  cleanup();
});

test("reveal runs once and accepts a tiny visible fraction of a very tall section", () => {
  const h = harness();
  const section = h.root.append(new FakeElement());
  const cleanup = h.mount();
  h.observers[0].enter(section, 0.001);
  assertVisible(section);
  assert.equal(h.observers[0].observed.has(section), false);
  h.observers[0].callback([{ target: section as unknown as Element, isIntersecting: false }]);
  h.mutationObservers[0].added(section);
  assertVisible(section);
  assert.equal(h.observers[0].observed.has(section), false);
  cleanup();
});

test("dynamic roots, descendants and new data attributes are enhanced without observing class changes", () => {
  const h = harness();
  const cleanup = h.mount();
  const group = h.root.append(new FakeElement());
  const child = group.append(new FakeElement());
  h.mutationObservers[0].added(group);
  assert.equal(group.classes.has("reveal-pending"), true);
  assert.equal(child.classes.has("reveal-pending"), true);
  const plain = h.root.append(new FakeElement());
  plain.hasReveal = false;
  h.mutationObservers[0].added(plain);
  assert.equal(h.observers[0].observed.has(plain), false);
  plain.hasReveal = true;
  h.mutationObservers[0].attribute(plain);
  assert.equal(h.observers[0].observed.has(plain), true);
  plain.hasReveal = false;
  h.mutationObservers[0].attribute(plain);
  assert.deepEqual([...plain.classes], []);
  child.detach();
  h.mutationObservers[0].added(group);
  assert.deepEqual([...child.classes], []);
  assert.equal(h.observers[0].observed.has(child), false);
  assert.deepEqual(h.mutationObservers[0].config, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-reveal"] });
  cleanup();
});

test("keyboard focus reveals every pending containing section, including initially focused fields", () => {
  const h = harness();
  const parent = h.root.append(new FakeElement());
  const child = parent.append(new FakeElement());
  const input = child.append(new FakeElement());
  input.hasReveal = false;
  const existingFocus = h.root.append(new FakeElement());
  h.document.activeElement = existingFocus;
  const cleanup = h.mount();
  assertVisible(existingFocus);
  h.focus(input);
  assertVisible(parent);
  assertVisible(child);
  cleanup();
});

test("live reduced-motion changes reveal pending content and never hide previously viewed nodes again", () => {
  const h = harness();
  const original = h.root.append(new FakeElement());
  const cleanup = h.mount();
  h.motion(true);
  assertVisible(original);
  assert.equal(h.observers[0].disconnected, true);
  const addedWhileReduced = h.root.append(new FakeElement());
  h.mutationObservers[0].added(addedWhileReduced);
  assertVisible(addedWhileReduced);
  h.motion(false);
  assertVisible(original);
  assertVisible(addedWhileReduced);
  assert.equal(h.observers.length, 2);
  assert.equal(h.observers[1].observed.size, 0);
  const newSection = h.root.append(new FakeElement());
  h.mutationObservers[0].added(newSection);
  assert.equal(newSection.classes.has("reveal-pending"), true);
  cleanup();
});

test("initial reduced motion and legacy media listeners remain usable and clean up", () => {
  const h = harness({ reduced: true, legacyMedia: true });
  const section = h.root.append(new FakeElement());
  const cleanup = h.mount();
  assertVisible(section);
  assert.equal(h.observers.length, 0);
  h.motion(false);
  assertVisible(section);
  assert.equal(h.observers.length, 1);
  cleanup();
  assert.equal(h.motionListeners.size, 0);
});

test("missing IntersectionObserver preserves readable content, including dynamically inserted blocks", () => {
  const h = harness({ noIO: true });
  const section = h.root.append(new FakeElement());
  const cleanup = h.mount();
  assertVisible(section);
  const dynamic = h.root.append(new FakeElement());
  h.mutationObservers[0].added(dynamic);
  assertVisible(dynamic);
  cleanup();
});

test("observer construction or observation failures fail open instead of hiding the page", () => {
  for (const option of [{ throwConstructor: true }, { throwObserve: true }]) {
    const h = harness(option);
    const section = h.root.append(new FakeElement());
    const cleanup = h.mount();
    assertVisible(section);
    cleanup();
    assert.deepEqual([...section.classes], []);
  }
});

test("route cleanup disconnects observers, listeners and classes; stale callbacks cannot hide content", () => {
  const h = harness();
  const pending = h.root.append(new FakeElement());
  const visible = h.root.append(new FakeElement(100));
  const cleanup = h.mount();
  cleanup();
  assert.equal(h.observers[0].disconnected, true);
  assert.equal(h.mutationObservers[0].disconnected, true);
  assert.equal(h.focusListeners.size, 0);
  assert.equal(h.motionListeners.size, 0);
  h.observers[0].enter(pending);
  h.mutationObservers[0].added(pending);
  for (const element of [pending, visible]) assert.deepEqual([...element.classes], []);
  const nextCleanup = h.mount();
  assert.equal(pending.classes.has("reveal-pending"), true);
  assertVisible(visible);
  nextCleanup();
});
