import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../services/resumeService", () => ({ saveResume: vi.fn() }));

import {
  AutosaveController,
  useResumeAutosave,
  type SaveFn,
} from "../hooks/useResumeAutosave";
import { useAppStore } from "../store/appStore";
import { createEmptyResume, type ResumeData } from "../types/resume";

function resume(summary: string): ResumeData {
  const r = createEmptyResume();
  r.summary = summary;
  return r;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("AutosaveController", () => {
  it("binds each save to the resume id given at schedule time", async () => {
    const save = vi.fn<SaveFn>(async (_u, _d, o) => ({ id: o.resumeId ?? "new" }));
    const c = new AutosaveController({ save });
    c.schedule("u", resume("A edit"), "A");
    // The user switches to B before the timer fires.
    c.bumpEpoch();
    c.schedule("u", resume("B edit"), "B");
    await c.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][1].summary).toBe("A edit");
    expect(save.mock.calls[0][2].resumeId).toBe("A");
    expect(save.mock.calls[1][1].summary).toBe("B edit");
    expect(save.mock.calls[1][2].resumeId).toBe("B");
  });

  it("serializes saves; edits during the first insert are saved after it, to the new id", async () => {
    const first = deferred<{ id: string }>();
    const save = vi.fn<SaveFn>();
    save.mockImplementationOnce(() => first.promise);
    save.mockImplementation(async (_u, _d, o) => ({ id: o.resumeId ?? "x" }));
    const c = new AutosaveController({ save, delay: 100 });

    c.schedule("u", resume("v1"), null);
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(c.status).toBe("saving");

    // Typing continues while the insert is in flight (id still unknown).
    c.schedule("u", resume("v2"), null);
    c.schedule("u", resume("v3"), null);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1); // nothing overlaps

    first.resolve({ id: "row-1" });
    await vi.advanceTimersByTimeAsync(0);
    await c.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1].summary).toBe("v3"); // latest wins
    expect(save.mock.calls[1][2].resumeId).toBe("row-1"); // update, not a duplicate insert
    expect(c.status).toBe("saved");
  });

  it("a finished create does not claim the active resume after a switch", async () => {
    const first = deferred<{ id: string }>();
    const onSaved = vi.fn();
    const save = vi.fn<SaveFn>(() => first.promise);
    const c = new AutosaveController({ save, onSaved });
    c.schedule("u", resume("draft"), null);
    void c.flush();
    c.bumpEpoch();
    first.resolve({ id: "row-1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(onSaved).toHaveBeenCalledWith(
      { id: "row-1" },
      { created: true, current: false },
    );
  });

  it("reports an error status, keeps the data and retries", async () => {
    const save = vi.fn<SaveFn>();
    save.mockResolvedValueOnce(null);
    save.mockResolvedValue({ id: "A" });
    const statuses: string[] = [];
    const c = new AutosaveController({
      save,
      delay: 10,
      retryDelay: 1000,
      onStatus: (s) => statuses.push(s),
    });
    c.schedule("u", resume("keep me"), "A");
    await vi.advanceTimersByTimeAsync(10);
    expect(c.status).toBe("error");
    expect(c.hasUnsaved()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1].summary).toBe("keep me");
    expect(c.status).toBe("saved");
    expect(statuses).toContain("error");
  });

  it("a thrown save is also an error, and the next change retries", async () => {
    const save = vi.fn<SaveFn>();
    save.mockRejectedValueOnce(new Error("network"));
    save.mockResolvedValue({ id: "A" });
    const c = new AutosaveController({ save, delay: 10, retryDelay: 60000 });
    c.schedule("u", resume("1"), "A");
    await vi.advanceTimersByTimeAsync(10);
    expect(c.status).toBe("error");
    c.schedule("u", resume("2"), "A");
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenLastCalledWith("u", expect.objectContaining({ summary: "2" }), expect.anything());
    expect(c.status).toBe("saved");
  });

  it("discard drops pending saves for a deleted resume", async () => {
    const save = vi.fn<SaveFn>(async () => ({ id: "x" }));
    const c = new AutosaveController({ save });
    c.schedule("u", resume("x"), "gone");
    c.discard("gone");
    await c.flush();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("useResumeAutosave (store integration)", () => {
  let save: ReturnType<typeof vi.fn<SaveFn>>;

  function setup() {
    save = vi.fn<SaveFn>(async (_u, _d, o) => ({ id: o.resumeId ?? "new-id", name: "N" }));
    return renderHook(() => useResumeAutosave({ userId: "user-1", save }));
  }

  beforeEach(() => {
    useAppStore.getState().setPrivacySettings({ saveLocalBackups: false });
    useAppStore.getState().setActiveResumeId("A");
    useAppStore.getState().setActiveResumeName("Resume A");
    useAppStore.getState().loadResume(resume("A0"));
  });

  it("does not save when a resume is merely loaded", async () => {
    setup();
    act(() => {
      useAppStore.getState().loadResume(resume("loaded"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("edit A then switch to B inside the debounce window saves A's data to A", async () => {
    setup();
    act(() => {
      useAppStore.getState().setResumeData(resume("A edited"));
    });
    act(() => {
      // what ResumeManager.handleSelect does
      useAppStore.getState().setActiveResumeId("B");
      useAppStore.getState().setActiveResumeName("Resume B");
      useAppStore.getState().loadResume(resume("B content"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].summary).toBe("A edited");
    expect(save.mock.calls[0][2].resumeId).toBe("A");
  });

  it("undo and keyword-style store changes are persisted", async () => {
    setup();
    act(() => {
      useAppStore.getState().setResumeData(resume("A1"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(save).toHaveBeenCalledTimes(1);

    act(() => {
      useAppStore.getState().undo(); // raw store path, bypasses any component handler
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1].summary).toBe("A0");
  });

  it("a first save claims the new id for the active draft", async () => {
    useAppStore.getState().setActiveResumeId(null);
    useAppStore.getState().setActiveResumeName(null);
    useAppStore.getState().loadResume(resume("draft"));
    setup();
    act(() => {
      useAppStore.getState().setResumeData(resume("draft 2"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(useAppStore.getState().activeResumeId).toBe("new-id");
    act(() => {
      useAppStore.getState().setResumeData(resume("draft 3"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(save.mock.calls[1][2].resumeId).toBe("new-id");
  });

  it("exposes an error status when saving fails", async () => {
    const { result } = setup();
    save.mockResolvedValue(null);
    act(() => {
      useAppStore.getState().setResumeData(resume("x"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.status).toBe("error");
  });
});
