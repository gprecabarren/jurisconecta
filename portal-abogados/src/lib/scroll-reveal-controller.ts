type RevealEnvironment = Pick<Window, "innerHeight"> & {
  matchMedia?: Window["matchMedia"];
  IntersectionObserver?: typeof IntersectionObserver;
  MutationObserver?: typeof MutationObserver;
};

/** Enhances visible HTML: no markup is hidden until observation is available. */
export function mountScrollReveal(document: Document, environment: RevealEnvironment): () => void {
  const tracked = new Set<HTMLElement>();
  const pending = new Set<HTMLElement>();
  const seen = new WeakSet<HTMLElement>();
  let observer: IntersectionObserver | undefined;
  let mutations: MutationObserver | undefined;
  let media: MediaQueryList | undefined;
  let disposed = false;
  let failed = false;
  let reduced = false;

  function reveal(element: HTMLElement) {
    element.classList.remove("reveal-pending");
    element.classList.add("reveal-visible");
    pending.delete(element);
    seen.add(element);
    observer?.unobserve(element);
  }

  function release(element: HTMLElement) {
    observer?.unobserve(element);
    element.classList.remove("reveal-pending", "reveal-visible");
    tracked.delete(element);
    pending.delete(element);
  }

  function failOpen() {
    failed = true;
    observer?.disconnect();
    mutations?.disconnect();
    observer = undefined;
    for (const element of tracked) reveal(element);
    for (const element of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      tracked.add(element);
      reveal(element);
    }
  }

  function safely(callback: () => void) {
    if (disposed || failed) return;
    try { callback(); } catch { failOpen(); }
  }

  function prepare(element: HTMLElement) {
    if (tracked.has(element)) return;
    tracked.add(element);
    const alreadyVisible = element.classList.contains("reveal-visible");
    const focused = document.activeElement && element.contains(document.activeElement);
    // Above-the-fold content, including the hero/LCP, must never disappear on hydration.
    if (reduced || !observer || seen.has(element) || alreadyVisible || focused || element.closest(".hero") || element.getBoundingClientRect().top < environment.innerHeight) {
      reveal(element);
      return;
    }
    // Observe before hiding: a broken observer leaves the original content readable.
    observer.observe(element);
    pending.add(element);
    element.classList.add("reveal-pending");
  }

  function scan(node: Node) {
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (element.matches("[data-reveal]")) prepare(element);
    for (const child of element.querySelectorAll<HTMLElement>("[data-reveal]")) prepare(child);
  }

  function enableObservation() {
    if (reduced || !environment.IntersectionObserver || observer) return;
    observer = new environment.IntersectionObserver((entries) => safely(() => {
      for (const entry of entries) {
        // Do not require 8% of a very tall section to fit in the viewport.
        if (entry.isIntersecting && pending.has(entry.target as HTMLElement)) reveal(entry.target as HTMLElement);
      }
    }), { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });
  }

  const onFocus = (event: Event) => safely(() => {
    const target = event.target as Node | null;
    if (!target) return;
    for (const element of pending) if (element.contains(target)) reveal(element);
  });

  const onMotionChange = (event: MediaQueryListEvent) => safely(() => {
    reduced = event.matches;
    if (reduced) {
      observer?.disconnect();
      observer = undefined;
      for (const element of tracked) reveal(element);
    } else {
      enableObservation();
      // Previously viewed nodes remain visible; discover nodes added without an observer.
      scan(document.documentElement);
    }
  });

  safely(() => {
    media = environment.matchMedia?.("(prefers-reduced-motion: reduce)");
    reduced = media?.matches ?? false;
    enableObservation();
    scan(document.documentElement);
    if (environment.MutationObserver) {
      mutations = new environment.MutationObserver((records) => safely(() => {
        for (const record of records) {
          if (record.type === "attributes") {
            const element = record.target as HTMLElement;
            if (element.matches("[data-reveal]")) prepare(element);
            else if (tracked.has(element)) release(element);
          } else {
            for (const node of record.addedNodes) scan(node);
          }
        }
        // Filtered lists and route updates must not retain detached nodes or hidden classes.
        for (const element of tracked) if (!element.isConnected) release(element);
      }));
      mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-reveal"] });
    }
    document.addEventListener("focusin", onFocus);
    if (media?.addEventListener) media.addEventListener("change", onMotionChange);
    else media?.addListener(onMotionChange);
  });

  return () => {
    disposed = true;
    observer?.disconnect();
    mutations?.disconnect();
    observer = undefined;
    document.removeEventListener("focusin", onFocus);
    if (media?.removeEventListener) media.removeEventListener("change", onMotionChange);
    else media?.removeListener(onMotionChange);
    for (const element of tracked) release(element);
  };
}
