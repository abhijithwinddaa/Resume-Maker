import { beforeEach, describe, expect, it, vi } from "vitest";

// The store reads the saved theme once, when the module loads.
async function freshStore() {
  vi.resetModules();
  const { useAppStore } = await import("../store/appStore");
  return useAppStore;
}

describe("theme default", () => {
  beforeEach(() => localStorage.clear());

  it("starts in light mode when the user never picked a theme", async () => {
    const store = await freshStore();
    expect(store.getState().theme).toBe("light");
  });

  it("keeps a theme the user picked", async () => {
    localStorage.setItem("theme-mode", "dark");
    const store = await freshStore();
    expect(store.getState().theme).toBe("dark");
  });
});
