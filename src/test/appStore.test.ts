import { describe, it, expect } from "vitest";
import { useAppStore } from "../store/appStore";

describe("appStore", () => {
  it("should have initial state", () => {
    const state = useAppStore.getState();
    expect(state.step).toBe("landing");
    expect(state.mode).toBeNull();
    expect(state.resumeText).toBe("");
    expect(state.jdText).toBe("");
    expect(state.resumeData).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isOptimizing).toBe(false);
  });

  it("should update step", () => {
    useAppStore.getState().setStep("editor");
    expect(useAppStore.getState().step).toBe("editor");
    useAppStore.getState().setStep("input");
  });

  it("should update resume text", () => {
    useAppStore.getState().setResumeText("My resume content");
    expect(useAppStore.getState().resumeText).toBe("My resume content");
    useAppStore.getState().setResumeText("");
  });

  it("should update JD text", () => {
    useAppStore.getState().setJdText("Job description");
    expect(useAppStore.getState().jdText).toBe("Job description");
    useAppStore.getState().setJdText("");
  });

  it("should set and clear errors", () => {
    useAppStore.getState().setError("Something went wrong");
    expect(useAppStore.getState().error).toBe("Something went wrong");
    useAppStore.getState().setError(null);
    expect(useAppStore.getState().error).toBeNull();
  });

  it("should cycle theme", () => {
    useAppStore.getState().setTheme("dark");
    expect(useAppStore.getState().theme).toBe("dark");
    useAppStore.getState().setTheme("light");
    expect(useAppStore.getState().theme).toBe("light");
    useAppStore.getState().setTheme("system");
    expect(useAppStore.getState().theme).toBe("system");
  });

  it("should update template ID", () => {
    useAppStore.getState().setTemplateId("modern");
    expect(useAppStore.getState().templateId).toBe("modern");
    useAppStore.getState().setTemplateId("classic");
  });

  it("should update export page mode", () => {
    useAppStore.getState().setExportPageMode("force-single-page");
    expect(useAppStore.getState().exportPageMode).toBe("force-single-page");
    useAppStore.getState().setExportPageMode("allow-multi-page");
    expect(useAppStore.getState().exportPageMode).toBe("allow-multi-page");
    useAppStore.getState().setExportPageMode("auto-adaptive");
    expect(useAppStore.getState().exportPageMode).toBe("auto-adaptive");
    expect(localStorage.getItem("export-page-mode")).toBe("auto-adaptive");
    useAppStore.getState().setExportPageMode("auto");
  });

  it("should handle undo/redo with no history gracefully", () => {
    expect(useAppStore.getState().canUndo()).toBe(false);
    expect(useAppStore.getState().canRedo()).toBe(false);
    // Should not throw
    useAppStore.getState().undo();
    useAppStore.getState().redo();
  });

  it("should startOver and reset state", () => {
    useAppStore.getState().setStep("editor");
    useAppStore.getState().setResumeText("some text");
    useAppStore.getState().setJdText("some jd");
    useAppStore.getState().setError("error");

    useAppStore.getState().startOver();
    const state = useAppStore.getState();
    expect(state.step).toBe("landing");
    expect(state.mode).toBeNull();
    expect(state.resumeText).toBe("");
    expect(state.jdText).toBe("");
    expect(state.resumeData).toBeNull();
    expect(state.error).toBeNull();
  });
});
