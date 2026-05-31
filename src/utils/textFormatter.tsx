import React from "react";

export interface FormatToken {
  text: string;
  bold: boolean;
  italic: boolean;
  highlight: boolean;
}

export function tokenizeText(text: string): FormatToken[] {
  if (!text) return [{ text: "", bold: false, italic: false, highlight: false }];

  const tokens: FormatToken[] = [];
  let remaining = text;

  const regex = /(\*\*(.+?)\*\*)|((?<!\w)\*(?=\S)(.+?)(?<=\S)\*(?!\w))|(==(.+?)==)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(remaining)) !== null) {
    // Push literal text before this match
    if (match.index > lastIndex) {
      tokens.push({
        text: remaining.slice(lastIndex, match.index),
        bold: false,
        italic: false,
        highlight: false,
      });
    }

    if (match[1]) {
      // **bold**
      tokens.push({ text: match[2], bold: true, italic: false, highlight: false });
    } else if (match[3]) {
      // *italic*
      tokens.push({ text: match[4], bold: false, italic: true, highlight: false });
    } else if (match[5]) {
      // ==highlight==
      tokens.push({ text: match[6], bold: false, italic: false, highlight: true });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining literal text
  if (lastIndex < remaining.length) {
    tokens.push({
      text: remaining.slice(lastIndex),
      bold: false,
      italic: false,
      highlight: false,
    });
  }

  return tokens.length > 0 ? tokens : [{ text, bold: false, italic: false, highlight: false }];
}

export function formatTextToReact(
  text: string,
  highlightKeywords?: string[],
): React.ReactNode {
  const tokens = tokenizeText(text);
  return tokens.map((token, i) => {
    let content: React.ReactNode = token.text;

    // ATS keyword highlighting inside token text
    if (highlightKeywords?.length && token.text) {
      content = applyKeywords(token.text, highlightKeywords);
    }

    if (token.bold) content = <strong key={i}>{content}</strong>;
    if (token.italic) content = <em key={i}>{content}</em>;
    if (token.highlight) content = <mark className="user-highlight" key={i}>{content}</mark>;

    return content;
  });
}

function applyKeywords(text: string, keywords: string[]): React.ReactNode {
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  const escapedKeywords = sorted.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(`(${escapedKeywords.join("|")})`, "gi");

  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const isHighlighted = escapedKeywords.some((k) =>
      new RegExp(`^${k}$`, "i").test(part),
    );
    return isHighlighted ? (
      <mark key={i} className="keyword-highlight">{part}</mark>
    ) : (
      part
    );
  });
}
