import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animateCount, initInteractions } from "../landing/interactions";

const MARKUP = `
<button data-theme-toggle>t</button>
<div data-tabs>
  <button role="tab" id="t1" aria-controls="p1" aria-selected="true">A</button>
  <button role="tab" id="t2" aria-controls="p2" aria-selected="false">B</button>
  <button role="tab" id="t3" aria-controls="p3" aria-selected="false">C</button>
  <div role="tabpanel" id="p1">1</div>
  <div role="tabpanel" id="p2">2</div>
  <div role="tabpanel" id="p3">3</div>
</div>
<div data-demo>
  <p data-demo-summary></p>
  <div data-demo-row id="r1"><span data-demo-status></span>
    <button data-demo-keep>Keep</button><button data-demo-discard>Discard</button></div>
  <div data-demo-row id="r2"><span data-demo-status></span>
    <button data-demo-keep>Keep</button><button data-demo-discard>Discard</button></div>
  <button data-demo-reset>Reset</button>
</div>
<div class="reveal" id="rv">x</div>
`;

let observers: { cb: IntersectionObserverCallback; els: Element[] }[] = [];

function mockMedia(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (q: string) => ({ matches: reduce && q.includes("reduce") }),
  );
}

function mockIO() {
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      els: Element[] = [];
      cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
        observers.push(this);
      }
      observe(el: Element) {
        this.els.push(el);
      }
      unobserve() {}
      disconnect() {}
    },
  );
}

beforeEach(() => {
  document.body.innerHTML = MARKUP;
  document.documentElement.className = "";
  document.documentElement.setAttribute("data-theme", "light");
  localStorage.clear();
  mockMedia(false);
  mockIO();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("tabs", () => {
  it("switches selection and panels on click", () => {
    initInteractions(document);
    document.getElementById("t2")!.click();
    expect(document.getElementById("t2")!.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("t1")!.getAttribute("aria-selected")).toBe("false");
    expect(document.getElementById("p2")!.hidden).toBe(false);
    expect(document.getElementById("p1")!.hidden).toBe(true);
    expect(document.getElementById("p3")!.hidden).toBe(true);
  });

  it("moves focus with arrow keys and wraps", () => {
    initInteractions(document);
    const t1 = document.getElementById("t1")!;
    t1.focus();
    t1.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement?.id).toBe("t2");
    document.getElementById("t3")!.focus();
    document
      .getElementById("t3")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement?.id).toBe("t1");
    t1.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement?.id).toBe("t3");
    expect(document.getElementById("p3")!.hidden).toBe(false);
  });
});

describe("review demo", () => {
  it("keeps, discards and resets", () => {
    initInteractions(document);
    const r1 = document.getElementById("r1")!;
    const r2 = document.getElementById("r2")!;
    r1.querySelector<HTMLElement>("[data-demo-keep]")!.click();
    r2.querySelector<HTMLElement>("[data-demo-discard]")!.click();
    expect(r1.dataset.state).toBe("kept");
    expect(r2.dataset.state).toBe("discarded");
    expect(r1.querySelector("[data-demo-status]")!.textContent).toBe("Kept");
    expect(r2.querySelector("[data-demo-status]")!.textContent).toBe("Discarded");
    document.querySelector<HTMLElement>("[data-demo-reset]")!.click();
    expect(r1.dataset.state).toBeUndefined();
    expect(r2.dataset.state).toBeUndefined();
    expect(r1.querySelector("[data-demo-status]")!.textContent).toBe("");
  });
});

describe("theme toggle", () => {
  it("flips data-theme and stores the choice", () => {
    initInteractions(document);
    const btn = document.querySelector<HTMLElement>("[data-theme-toggle]")!;
    btn.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme-mode")).toBe("dark");
    btn.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("theme-mode")).toBe("light");
  });
});

describe("reveal", () => {
  it("adds js class and is-visible when intersecting", () => {
    initInteractions(document);
    expect(document.documentElement.classList.contains("js")).toBe(true);
    const el = document.getElementById("rv")!;
    expect(el.classList.contains("is-visible")).toBe(false);
    observers[0].cb(
      [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
      observers[0] as unknown as IntersectionObserver,
    );
    expect(el.classList.contains("is-visible")).toBe(true);
  });

  it("shows everything immediately under reduced motion", () => {
    mockMedia(true);
    initInteractions(document);
    expect(document.getElementById("rv")!.classList.contains("is-visible")).toBe(true);
  });
});

describe("animateCount", () => {
  it("sets the final value immediately under reduced motion", () => {
    mockMedia(true);
    const el = document.createElement("span");
    animateCount(el, 12345);
    expect(el.textContent).toBe("12,345");
    expect(el.getAttribute("aria-label")).toBe("12,345");
  });

  it("ends at the target when animating", () => {
    let t = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const el = document.createElement("span");
    animateCount(el, 1000);
    let guard = 0;
    while (frames.length && guard++ < 200) {
      t += 100;
      frames.shift()!(t);
    }
    expect(el.textContent).toBe("1,000");
    expect(guard).toBeLessThan(200);
  });
});
