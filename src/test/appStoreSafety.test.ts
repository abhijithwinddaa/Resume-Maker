import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useAppStore, safeSet } from "../store/appStore";
import { hasLocalBackup } from "../utils/localBackup";
import { createEmptyResume } from "../types/resume";
import type { KeywordSuggestion } from "../utils/aiService";

function resumeWithBullets(bullets: string[]) {
  const r = createEmptyResume();
  r.experience[0].company = "Acme";
  r.experience[0].bullets = bullets;
  return r;
}

beforeEach(() => {
  useAppStore.getState().loadResume(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadResume", () => {
  it("sets data, resets history and bumps loadEpoch", () => {
    const s = useAppStore.getState();
    const a = createEmptyResume();
    const b = createEmptyResume();
    b.summary = "B";
    s.loadResume(a);
    s.setResumeData({ ...a, summary: "edited A" });
    expect(useAppStore.getState().canUndo()).toBe(true);

    const epoch = useAppStore.getState().loadEpoch;
    useAppStore.getState().loadResume(b);
    const after = useAppStore.getState();
    expect(after.resumeData).toBe(b);
    expect(after.canUndo()).toBe(false);
    expect(after.canRedo()).toBe(false);
    expect(after.loadEpoch).toBe(epoch + 1);

    after.undo(); // must not bring A back
    expect(useAppStore.getState().resumeData).toBe(b);
  });
});

describe("applyKeywordSuggestion", () => {
  const suggestion = (over: Partial<KeywordSuggestion>): KeywordSuggestion => ({
    section: "experience",
    index: 0,
    editType: "rewrite",
    bulletIndex: 1,
    originalText: "second",
    suggestedText: "second with Docker",
    keyword: "Docker",
    reason: "",
    ...over,
  });

  it("applies when the bullet still matches", () => {
    useAppStore.getState().loadResume(resumeWithBullets(["first", "second"]));
    expect(useAppStore.getState().applyKeywordSuggestion(suggestion({}))).toBe(true);
    expect(useAppStore.getState().resumeData?.experience[0].bullets).toEqual([
      "first",
      "second with Docker",
    ]);
  });

  it("refuses when the bullet at the index changed and the original is gone", () => {
    useAppStore.getState().loadResume(resumeWithBullets(["first", "user rewrote this"]));
    expect(useAppStore.getState().applyKeywordSuggestion(suggestion({}))).toBe(false);
    expect(useAppStore.getState().resumeData?.experience[0].bullets).toEqual([
      "first",
      "user rewrote this",
    ]);
  });

  it("finds the original bullet if it moved", () => {
    useAppStore.getState().loadResume(resumeWithBullets(["second", "first"]));
    expect(useAppStore.getState().applyKeywordSuggestion(suggestion({}))).toBe(true);
    expect(useAppStore.getState().resumeData?.experience[0].bullets).toEqual([
      "second with Docker",
      "first",
    ]);
  });

  it("appends new bullets", () => {
    useAppStore.getState().loadResume(resumeWithBullets(["first"]));
    const ok = useAppStore
      .getState()
      .applyKeywordSuggestion(
        suggestion({ editType: "new", bulletIndex: undefined, originalText: undefined, suggestedText: "added" }),
      );
    expect(ok).toBe(true);
    expect(useAppStore.getState().resumeData?.experience[0].bullets).toEqual(["first", "added"]);
  });
});

describe("localStorage failures", () => {
  function breakStorage() {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
  }

  it("safeSet returns false instead of throwing", () => {
    breakStorage();
    expect(() => safeSet("k", "v")).not.toThrow();
    expect(safeSet("k", "v")).toBe(false);
  });

  it("preference setters still update state", () => {
    breakStorage();
    const s = useAppStore.getState();
    expect(() => s.setTemplateId("modern")).not.toThrow();
    expect(useAppStore.getState().templateId).toBe("modern");
    expect(() => s.setCustomization({ fontSize: 11 } as never)).not.toThrow();
    expect(() => s.setTheme("dark")).not.toThrow();
    expect(useAppStore.getState().theme).toBe("dark");
    expect(() => s.setExportPageMode("allow-multi-page")).not.toThrow();
    expect(useAppStore.getState().exportPageMode).toBe("allow-multi-page");
    s.setTemplateId("classic");
    s.setTheme("light");
    s.setExportPageMode("auto");
  });

  it("hasLocalBackup does not throw", () => {
    breakStorage();
    expect(hasLocalBackup()).toBe(false);
  });
});
