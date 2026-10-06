import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LandingData } from "../landing/types";

vi.mock("../utils/analytics", () => ({
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackEvent: vi.fn(),
}));
vi.mock("../utils/campaignAttribution", () => ({
  recordCampaignAttribution: vi.fn(),
}));
vi.mock("../landing/interactions", () => ({
  initInteractions: vi.fn(),
  animateCount: vi.fn((el: HTMLElement, to: number) => {
    el.textContent = String(to);
  }),
}));
vi.mock("../landing/data", async (orig) => {
  const actual = await orig<typeof import("../landing/data")>();
  return { ...actual, loadLandingData: vi.fn(async () => null) };
});

import { LANDING_CACHE_KEY } from "../landing/data";

const FRESH: LandingData = {
  generatedAt: "2026-05-01T00:00:00Z",
  rating: {
    average: 4.6,
    count: 42,
    distribution: { 1: 1, 2: 0, 3: 3, 4: 9, 5: 29 },
  },
  reviews: [
    {
      id: "a",
      rating: 5,
      comment: "<img src=x onerror=alert(1)> Great builder, really easy",
      createdAt: "2026-03-10T10:00:00Z",
      reply: "Thank you!",
    },
    {
      id: "b",
      rating: 4,
      comment: "Solid templates and fast exports for my job search",
      createdAt: "2026-02-02T10:00:00Z",
    },
  ],
  stats: {
    downloads: 120,
    editSessions: 300,
    atsScorings: 90,
    resumesCreated: 70,
    downloadUsers: 40,
  },
};

describe("loadLandingData (client SWR)", () => {
  let actualLoad: typeof import("../landing/data").loadLandingData;

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("../landing/data")>(
      "../landing/data",
    );
    actualLoad = actual.loadLandingData;
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("delivers cached first, then fresh, and stores fresh", async () => {
    localStorage.setItem(
      LANDING_CACHE_KEY,
      JSON.stringify({ ...FRESH, generatedAt: "old" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(FRESH))),
    );
    const seen: string[] = [];
    const result = await actualLoad((d) => seen.push(d.generatedAt));
    expect(seen).toEqual(["old", FRESH.generatedAt]);
    expect(result?.generatedAt).toBe(FRESH.generatedAt);
    expect(JSON.parse(localStorage.getItem(LANDING_CACHE_KEY)!)).toEqual(FRESH);
  });

  it("keeps the cached value when the request times out", async () => {
    vi.useFakeTimers();
    localStorage.setItem(LANDING_CACHE_KEY, JSON.stringify(FRESH));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            init.signal!.addEventListener("abort", () =>
              rej(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const onData = vi.fn();
    const p = actualLoad(onData);
    await vi.advanceTimersByTimeAsync(2500);
    const result = await p;
    expect(onData).toHaveBeenCalledTimes(1);
    expect(result).toEqual(FRESH);
  });

  it("returns null with no cache and a failing network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await actualLoad()).toBeNull();
  });

  it("does not overwrite a good cache with an empty degraded response", async () => {
    localStorage.setItem(LANDING_CACHE_KEY, JSON.stringify(FRESH));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              generatedAt: "x",
              rating: null,
              reviews: [],
              stats: null,
            }),
          ),
      ),
    );
    const result = await actualLoad();
    expect(result).toEqual(FRESH);
    expect(JSON.parse(localStorage.getItem(LANDING_CACHE_KEY)!)).toEqual(FRESH);
  });

  it("tolerates storage throwing", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(FRESH))),
    );
    const onData = vi.fn();
    const result = await actualLoad(onData);
    expect(onData).toHaveBeenCalledWith(FRESH);
    expect(result).toEqual(FRESH);
  });

  it("ignores corrupt cache and malformed responses", async () => {
    localStorage.setItem(LANDING_CACHE_KEY, "{not json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ hello: 1 }))),
    );
    expect(await actualLoad()).toBeNull();
  });
});

describe("hydration", () => {
  const MARKUP = `
    <a data-cta="hero-ats" data-mode="ats" href="/app/">Go</a>
    <a href="#reviews" data-reviews-link hidden>Reviews</a>
    <div data-hide-until-rating hidden>
      <span data-rating-average></span> from <span data-rating-count></span>
    </div>
    <section data-stats-section hidden>
      <span data-stat="downloads">0</span>
      <span data-stat="atsScorings">0</span>
      <span data-stat="resumesCreated">0</span>
      <span data-stat="editSessions">0</span>
      <span data-downloads-users></span>
    </section>
    <section data-reviews-section hidden>
      <span data-rating-average></span>
      <span data-rating-count></span>
      <span data-rating-breakdown></span>
      <div data-reviews-list></div>
    </section>
    <template id="review-template">
      <article>
        <span data-review-stars></span>
        <p data-review-comment></p>
        <time data-review-date></time>
        <div data-review-reply hidden><span data-review-reply-text></span></div>
      </article>
    </template>`;

  let hydrateLanding: typeof import("../landing/main").hydrateLanding;
  let rewriteCtaLinks: typeof import("../landing/main").rewriteCtaLinks;

  beforeEach(async () => {
    document.body.innerHTML = MARKUP;
    ({ hydrateLanding, rewriteCtaLinks } = await import("../landing/main"));
  });

  const q = (s: string) => document.querySelector<HTMLElement>(s)!;

  it("keeps sections hidden with no data", () => {
    hydrateLanding(document, null);
    hydrateLanding(document, {
      generatedAt: "x",
      rating: null,
      reviews: [],
      stats: null,
    });
    expect(q("[data-stats-section]").hidden).toBe(true);
    expect(q("[data-reviews-section]").hidden).toBe(true);
    expect(q("[data-hide-until-rating]").hidden).toBe(true);
    // A nav link to a section that never appears would scroll nowhere.
    expect(q("[data-reviews-link]").hidden).toBe(true);
  });

  it("reveals the Reviews nav links together with the reviews section", () => {
    hydrateLanding(document, FRESH);
    expect(q("[data-reviews-section]").hidden).toBe(false);
    expect(q("[data-reviews-link]").hidden).toBe(false);
  });

  it("hydrates stats, rating and reviews via textContent", () => {
    hydrateLanding(document, FRESH);
    expect(q("[data-stats-section]").hidden).toBe(false);
    expect(q('[data-stat="downloads"]').textContent).toBe("120");
    expect(q("[data-downloads-users]").textContent).toBe("40");
    expect(q("[data-hide-until-rating]").hidden).toBe(false);
    expect(q("[data-hide-until-rating] [data-rating-average]").textContent).toBe(
      "4.6",
    );
    expect(q("[data-reviews-section]").hidden).toBe(false);
    expect(q("[data-rating-count]").textContent).toBe("42");

    const cards = document.querySelectorAll("[data-reviews-list] article");
    expect(cards).toHaveLength(2);
    // XSS: markup in a comment stays inert text.
    expect(document.querySelector("[data-reviews-list] img")).toBeNull();
    expect(cards[0].querySelector("[data-review-comment]")!.textContent).toContain(
      "<img src=x",
    );
    const stars = cards[0].querySelector<HTMLElement>("[data-review-stars]")!;
    expect(stars.textContent).toBe("★★★★★");
    expect(stars.getAttribute("aria-label")).toBe("5 out of 5 stars");
    expect(cards[0].querySelector("[data-review-date]")!.textContent).toBe(
      "Mar 2026",
    );
  });

  it("omits zero buckets in the breakdown", () => {
    hydrateLanding(document, FRESH);
    expect(q("[data-rating-breakdown]").textContent).toBe(
      "29 five-star, 9 four-star, 3 three-star, 1 one-star",
    );
  });

  it("shows the reply only when present and is idempotent", () => {
    hydrateLanding(document, FRESH);
    hydrateLanding(document, FRESH);
    const cards = document.querySelectorAll("[data-reviews-list] article");
    expect(cards).toHaveLength(2);
    const r0 = cards[0].querySelector<HTMLElement>("[data-review-reply]")!;
    const r1 = cards[1].querySelector<HTMLElement>("[data-review-reply]")!;
    expect(r0.hidden).toBe(false);
    expect(r0.querySelector("[data-review-reply-text]")!.textContent).toBe(
      "Thank you!",
    );
    expect(r1.hidden).toBe(true);
  });

  it("rewrites CTA hrefs keeping utm params", () => {
    rewriteCtaLinks(document, "?utm_source=ads");
    expect(q("a[data-cta]").getAttribute("href")).toBe(
      "/app/?utm_source=ads&mode=ats&from=landing&cta=hero-ats",
    );
  });
});
