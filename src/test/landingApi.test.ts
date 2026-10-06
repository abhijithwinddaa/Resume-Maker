import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, {
  buildLandingData,
  curateReviews,
  mapStats,
  summarizeRating,
} from "../../api/landing-data";

const LONG =
  "Clean templates and the ATS score helped me land interviews quickly.";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    rating: 5,
    comment: LONG,
    created_at: "2026-03-10T10:00:00Z",
    admin_reply: null,
    ...over,
  };
}

describe("curateReviews", () => {
  it("keeps rating>=4 and 30-400 trimmed chars", () => {
    const out = curateReviews([
      row({ id: "ok" }),
      row({ id: "low", rating: 3 }),
      row({ id: "short", comment: "Great app, loved it" }),
      row({ id: "long", comment: "x".repeat(401) }),
      row({ id: "padded", comment: "   " + "y".repeat(29) + "   " }),
      row({ id: "edge", comment: "z".repeat(30) }),
      row({ id: "edge400", comment: "w".repeat(400) }),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["edge", "edge400", "ok"]);
  });

  it("excludes requests and complaints", () => {
    const bad = [
      "Please add a dark mode option to the editor soon",
      "Could you support more templates for designers?",
      "There is a bug when I export the PDF file sometimes",
      "The download is not working for me at all today",
      "Can you add LinkedIn import to this tool please",
      "Got an error when saving but otherwise very nice",
    ];
    const out = curateReviews(
      bad.map((c, i) => row({ id: "b" + i, comment: c })),
    );
    expect(out).toEqual([]);
  });

  it("orders by rating desc, length desc, newest, max 6", () => {
    const base = "Really helpful resume builder with clean output";
    const rows = [
      row({ id: "a", rating: 4, comment: base + " aaaa" }),
      row({ id: "b", rating: 5, comment: base }),
      row({ id: "c", rating: 5, comment: base + " longer text here" }),
      row({
        id: "d",
        rating: 5,
        comment: base,
        created_at: "2026-04-01T00:00:00Z",
      }),
      ...Array.from({ length: 6 }, (_, i) =>
        row({ id: "x" + i, rating: 4, comment: base + " " + "q".repeat(i) }),
      ),
    ];
    const out = curateReviews(rows);
    expect(out).toHaveLength(6);
    expect(out.slice(0, 3).map((r) => r.id)).toEqual(["c", "d", "b"]);
  });

  it("maps whitelisted fields only and includes reply when present", () => {
    const out = curateReviews([
      row({
        admin_reply: " Thanks! ",
        user_email: "a@b.c",
        user_id: "u",
        admin_notes: "n",
      }),
    ]);
    expect(out).toEqual([
      {
        id: "r1",
        rating: 5,
        comment: LONG,
        createdAt: "2026-03-10T10:00:00Z",
        reply: "Thanks!",
      },
    ]);
  });
});

describe("summarizeRating", () => {
  it("is null with no rows", () => {
    expect(summarizeRating([])).toBeNull();
  });

  it("computes over all rows, rounded to 1 decimal", () => {
    const rows = [5, 5, 4, 3, 1, 5].map((rating, i) =>
      row({ id: String(i), rating, comment: "short" }),
    );
    const r = summarizeRating(rows)!;
    expect(r.count).toBe(6);
    expect(r.average).toBe(3.8);
    expect(r.distribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 1, 5: 3 });
  });
});

describe("mapStats", () => {
  it("maps counters incl downloadUsers", () => {
    expect(
      mapStats([
        { feature_key: "resume_download", total_count: 120, unique_users: 40 },
        { feature_key: "ats_resume_edit", total_count: 90, unique_users: 30 },
        { feature_key: "create_resume", total_count: 70, unique_users: 20 },
        { feature_key: "resume_edit", total_count: 300, unique_users: 50 },
        { feature_key: "other", total_count: 1, unique_users: 1 },
      ]),
    ).toEqual({
      downloads: 120,
      atsScorings: 90,
      resumesCreated: 70,
      editSessions: 300,
      downloadUsers: 40,
    });
  });

  it("is null with no rows", () => {
    expect(mapStats([])).toBeNull();
  });
});

describe("buildLandingData", () => {
  it("never leaks email even when upstream rows carry it", () => {
    const data = buildLandingData(
      [
        row({
          user_email: "secret@example.com",
          user_id: "uid",
          admin_notes: "x",
          author_label: "se***@example.com",
        }),
      ],
      [
        {
          feature_key: "resume_download",
          total_count: 1,
          unique_users: 1,
          user_email: "leak@x.com",
        },
      ],
    );
    const json = JSON.stringify(data).toLowerCase();
    expect(json).not.toContain("email");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("user_id");
    expect(json).not.toContain("admin_notes");
    expect(json).not.toContain("author");
  });
});

describe("handler", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = "https://proj.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "anon";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  const counters = [
    { feature_key: "resume_download", total_count: 120, unique_users: 40 },
    { feature_key: "ats_resume_edit", total_count: 90, unique_users: 30 },
    { feature_key: "create_resume", total_count: 70, unique_users: 20 },
    { feature_key: "resume_edit", total_count: 300, unique_users: 50 },
  ];
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status });
  const get = () => new Request("https://x.test/api/landing-data");

  it("serves curated data with edge cache headers", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.includes("rpc/get_public_feedback")) {
          return json([
            row({ user_email: "a@b.c", author_label: "ab***@b.c" }),
          ]);
        }
        return json(counters);
      }),
    );
    const res = (await handler(get())) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=86400",
    );
    const body = await res.json();
    expect(body).toEqual({
      generatedAt: expect.any(String),
      rating: {
        average: 5,
        count: 1,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
      },
      reviews: [
        {
          id: "r1",
          rating: 5,
          comment: LONG,
          createdAt: "2026-03-10T10:00:00Z",
        },
      ],
      stats: {
        downloads: 120,
        editSessions: 300,
        atsScorings: 90,
        resumesCreated: 70,
        downloadUsers: 40,
      },
    });
    expect(JSON.stringify(body).toLowerCase()).not.toContain("email");
    expect(calls[0]).toBe(
      "POST https://proj.supabase.co/rest/v1/rpc/get_public_feedback",
    );
  });

  it.each([
    ["404", () => json({ message: "nf" }, 404)],
    ["PGRST202", () => json({ code: "PGRST202", message: "nf" }, 400)],
  ])("falls back to a safe-column table query on %s", async (_n, rpcRes) => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("rpc/get_public_feedback")) return rpcRes();
        if (url.includes("app_feedback")) return json([row()]);
        return json(counters);
      }),
    );
    const res = (await handler(get())) as Response;
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    const fb = urls.find((u) => u.includes("rest/v1/app_feedback"))!;
    expect(fb).toContain("select=id,rating,comment,created_at,admin_reply");
    expect(fb).toContain("is_public=eq.true");
    expect(fb).toContain("status=neq.rejected");
    expect(fb).not.toMatch(/user_email|user_id|admin_notes/);
  });

  it("degrades to nulls with a short cache when Supabase fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "boom" }, 500)));
    const res = (await handler(get())) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60");
    const body = await res.json();
    expect(body.rating).toBeNull();
    expect(body.reviews).toEqual([]);
    expect(body.stats).toBeNull();
  });

  it("degrades when fetch throws or env is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("net");
      }),
    );
    let res = (await handler(get())) as Response;
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60");
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    res = (await handler(get())) as Response;
    expect((await res.json()).stats).toBeNull();
  });

  it("rejects non-GET", async () => {
    const res = (await handler(
      new Request("https://x.test/api/landing-data", {
        method: "POST",
        body: "{}",
      }),
    )) as Response;
    expect(res.status).toBe(405);
  });

  it("writes to a node response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const out = await handler(
      { method: "GET", url: "/api/landing-data", headers: {} },
      res,
    );
    expect(out).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalled();
  });
});
