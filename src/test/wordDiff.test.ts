import { describe, expect, it } from "vitest";
import { diffWords } from "../utils/wordDiff";

const changed = (segs: { text: string; changed: boolean }[]) =>
  segs.filter((s) => s.changed).map((s) => s.text.trim()).join(" ");
const joined = (segs: { text: string }[]) => segs.map((s) => s.text).join("");

describe("diffWords", () => {
  it("marks only the words that differ", () => {
    const { before, after } = diffWords(
      "Worked on the checkout page",
      "Built the React checkout page",
    );

    expect(changed(before)).toBe("Worked on");
    expect(changed(after)).toBe("Built React");
  });

  it("reproduces both texts exactly", () => {
    const a = "Cut bundle size 35% by code splitting";
    const b = "Cut the bundle size 35% with lazy routes";
    const { before, after } = diffWords(a, b);

    expect(joined(before)).toBe(a);
    expect(joined(after)).toBe(b);
  });

  it("handles an added or removed text", () => {
    expect(changed(diffWords("", "New bullet").after)).toBe("New bullet");
    expect(changed(diffWords("Old bullet", "").before)).toBe("Old bullet");
  });

  it("marks nothing when the texts are equal", () => {
    const { before, after } = diffWords("Same text", "Same text");
    expect(changed(before)).toBe("");
    expect(changed(after)).toBe("");
  });
});
