import { describe, expect, it } from "vitest";
import { tokenizeText } from "../utils/textFormatter.tsx";

describe("tokenizeText", () => {
  it("returns literal text when no markers", () => {
    const tokens = tokenizeText("plain text");
    expect(tokens).toEqual([{ text: "plain text", bold: false, italic: false, highlight: false }]);
  });

  it("parses **bold** markers", () => {
    const tokens = tokenizeText("**bold**");
    expect(tokens).toEqual([{ text: "bold", bold: true, italic: false, highlight: false }]);
  });

  it("parses *italic* markers", () => {
    const tokens = tokenizeText("*italic*");
    expect(tokens).toEqual([{ text: "italic", bold: false, italic: true, highlight: false }]);
  });

  it("parses ==highlight== markers", () => {
    const tokens = tokenizeText("==highlight==");
    expect(tokens).toEqual([{ text: "highlight", bold: false, italic: false, highlight: true }]);
  });

  it("parses mixed markers in one string", () => {
    const tokens = tokenizeText("**bold** and *italic* and ==highlight==");
    expect(tokens).toHaveLength(5);
    expect(tokens[0]).toEqual({ text: "bold", bold: true, italic: false, highlight: false });
    expect(tokens[1]).toEqual({ text: " and ", bold: false, italic: false, highlight: false });
    expect(tokens[2]).toEqual({ text: "italic", bold: false, italic: true, highlight: false });
    expect(tokens[3]).toEqual({ text: " and ", bold: false, italic: false, highlight: false });
    expect(tokens[4]).toEqual({ text: "highlight", bold: false, italic: false, highlight: true });
  });

  it("treats unclosed markers as literal", () => {
    const tokens = tokenizeText("**unclosed");
    expect(tokens).toEqual([{ text: "**unclosed", bold: false, italic: false, highlight: false }]);
  });

  it("treats unclosed == as literal", () => {
    const tokens = tokenizeText("==unclosed");
    expect(tokens).toEqual([{ text: "==unclosed", bold: false, italic: false, highlight: false }]);
  });

  it("handles empty string", () => {
    const tokens = tokenizeText("");
    expect(tokens).toEqual([{ text: "", bold: false, italic: false, highlight: false }]);
  });

  it("handles text with no markers", () => {
    const tokens = tokenizeText("Increased revenue by 30% using React");
    expect(tokens).toEqual([
      { text: "Increased revenue by 30% using React", bold: false, italic: false, highlight: false },
    ]);
  });

  it("parses bold mixed with plain text", () => {
    const tokens = tokenizeText("Increased **revenue** by **30%**");
    expect(tokens).toHaveLength(4);
    expect(tokens[0]).toEqual({ text: "Increased ", bold: false, italic: false, highlight: false });
    expect(tokens[1]).toEqual({ text: "revenue", bold: true, italic: false, highlight: false });
    expect(tokens[2]).toEqual({ text: " by ", bold: false, italic: false, highlight: false });
    expect(tokens[3]).toEqual({ text: "30%", bold: true, italic: false, highlight: false });
  });

  it("does not match italic when asterisk has spaces inside", () => {
    const tokens = tokenizeText("* 5+ years of experience *");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].italic).toBe(false);
    expect(tokens[0].text).toBe("* 5+ years of experience *");
  });

  it("matches word-hugging italic", () => {
    const tokens = tokenizeText("*word*");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].italic).toBe(true);
    expect(tokens[0].text).toBe("word");
  });

  it("parses consecutive formatted tokens", () => {
    const tokens = tokenizeText("**bold**==highlight==");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toEqual({ text: "bold", bold: true, italic: false, highlight: false });
    expect(tokens[1]).toEqual({ text: "highlight", bold: false, italic: false, highlight: true });
  });
});
