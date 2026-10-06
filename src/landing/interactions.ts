/* Landing page interactions. No dependencies, no data fetching. */

const reduced = (): boolean =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const $$ = <T extends Element = HTMLElement>(
  root: ParentNode,
  sel: string,
): T[] => Array.from(root.querySelectorAll<T>(sel));

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

export function animateCount(el: HTMLElement, to: number): void {
  const final = fmt(to);
  el.setAttribute("aria-label", final);
  if (reduced() || typeof requestAnimationFrame !== "function" || to <= 0) {
    el.textContent = final;
    return;
  }
  const dur = 900;
  let start = -1;
  const step = (t: number) => {
    if (start < 0) start = t;
    const p = Math.min(1, (t - start) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = final;
  };
  requestAnimationFrame(step);
}

function initTabs(root: Document): void {
  $$(root, "[data-tabs]").forEach((wrap) => {
    const tabs = $$(wrap, '[role="tab"]');
    const select = (i: number, focus: boolean) => {
      tabs.forEach((tab, j) => {
        const on = i === j;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        const id = tab.getAttribute("aria-controls");
        const panel = id ? root.getElementById(id) : null;
        if (panel) panel.hidden = !on;
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(i, false));
      tab.addEventListener("keydown", (e) => {
        const k = (e as KeyboardEvent).key;
        const n = tabs.length;
        let j = -1;
        if (k === "ArrowRight" || k === "ArrowDown") j = (i + 1) % n;
        else if (k === "ArrowLeft" || k === "ArrowUp") j = (i - 1 + n) % n;
        else if (k === "Home") j = 0;
        else if (k === "End") j = n - 1;
        if (j < 0) return;
        e.preventDefault();
        select(j, true);
      });
    });
    const first = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    if (tabs.length) select(first < 0 ? 0 : first, false);
  });
}

function initDemo(root: Document): void {
  $$(root, "[data-demo]").forEach((demo) => {
    const rows = $$(demo, "[data-demo-row]");
    const summary = demo.querySelector<HTMLElement>("[data-demo-summary]");
    const update = () => {
      if (!summary) return;
      const kept = rows.filter((r) => r.dataset.state === "kept").length;
      const dis = rows.filter((r) => r.dataset.state === "discarded").length;
      summary.textContent =
        kept + dis === 0
          ? `${rows.length} changes to review`
          : `${kept} kept, ${dis} discarded, ${rows.length - kept - dis} left`;
    };
    rows.forEach((row) => {
      const status = row.querySelector<HTMLElement>("[data-demo-status]");
      const set = (state: string) => {
        row.dataset.state = state;
        if (status)
          status.textContent = state === "kept" ? "Kept" : "Discarded";
      };
      row
        .querySelector("[data-demo-keep]")
        ?.addEventListener("click", () => {
          set("kept");
          update();
        });
      row
        .querySelector("[data-demo-discard]")
        ?.addEventListener("click", () => {
          set("discarded");
          update();
        });
    });
    demo.querySelector("[data-demo-reset]")?.addEventListener("click", () => {
      rows.forEach((row) => {
        delete row.dataset.state;
        const status = row.querySelector<HTMLElement>("[data-demo-status]");
        if (status) status.textContent = "";
      });
      update();
    });
    update();
  });
}

function initTheme(root: Document): void {
  $$(root, "[data-theme-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const el = root.documentElement;
      const next = el.getAttribute("data-theme") === "dark" ? "light" : "dark";
      el.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme-mode", next);
      } catch {
        /* storage unavailable */
      }
    }),
  );
}

function initNav(root: Document): void {
  const win = root.defaultView;
  const nav = root.querySelector<HTMLElement>("[data-nav]");
  if (nav && win) {
    const on = () => nav.classList.toggle("is-scrolled", win.scrollY > 8);
    win.addEventListener("scroll", on, { passive: true });
    on();
  }
  const btn = root.querySelector<HTMLElement>("[data-menu-btn]");
  const panel = root.querySelector<HTMLElement>("[data-menu-panel]");
  if (!btn || !panel) return;
  const set = (open: boolean) => {
    btn.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
  };
  btn.addEventListener("click", () =>
    set(btn.getAttribute("aria-expanded") !== "true"),
  );
  panel.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a")) set(false);
  });
  root.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && !panel.hidden) {
      set(false);
      btn.focus();
    }
  });
}

export function initInteractions(root: Document): void {
  const html = root.documentElement;
  html.classList.add("js");
  initTheme(root);
  initNav(root);
  initTabs(root);
  initDemo(root);

  const reveals = $$(root, ".reveal");
  const badge = root.querySelector<HTMLElement>("[data-live-badge]");
  const still = reduced();
  const value = badge?.querySelector<HTMLElement>("[data-live-value]");
  const ring = badge?.querySelector<SVGElement>("[data-live-ring]");
  const steps = [60, 78, 86];
  let timer: ReturnType<typeof setInterval> | undefined;
  let idx = 2;
  const paint = (n: number) => {
    if (value) value.textContent = String(n);
    // circumference of r=15.5 ring is ~97.4
    ring?.setAttribute("stroke-dashoffset", String(97.4 * (1 - n / 100)));
    badge?.classList.remove("is-pulse");
    if (!still && badge) {
      void badge.offsetWidth;
      badge.classList.add("is-pulse");
    }
  };
  const setLoop = (run: boolean) => {
    if (!badge || still) return;
    if (run && !timer) {
      timer = setInterval(() => {
        idx = (idx + 1) % steps.length;
        paint(steps[idx]);
      }, 1200);
    } else if (!run && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  if (badge) paint(86);

  if (still || typeof IntersectionObserver === "undefined") {
    reveals.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.target === badge) {
          setLoop(e.isIntersecting);
        } else if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15 },
  );
  reveals.forEach((el) => io.observe(el));
  if (badge) io.observe(badge);
}
