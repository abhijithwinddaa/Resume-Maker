/**
 * Flags claims an AI rewrite introduced that the original bullet never made.
 *
 * The server already reverts invented numbers and tools, but vague claims
 * ("to improve user engagement", "collaborated with designers") can't be
 * reverted automatically without killing good rewrites. So we point them out
 * and let the user decide. Deterministic and deliberately conservative: it
 * only looks for a fixed list of outcome / collaboration / scope triggers, and
 * stays quiet if the original already used that trigger (or its stem).
 */

interface Trigger {
  /** Matches the trigger (with an optional lead-in) inside the new text. */
  match: string;
  /** If this appears in the original text, the claim is not new. */
  stem: string;
}

const TRIGGERS: Trigger[] = [
  // Outcome / impact claims.
  { match: "(?:(?:which|to)\\s+)?improv\\w*", stem: "improv" },
  { match: "(?:to\\s+)?enhanc\\w*", stem: "enhanc" },
  { match: "(?:to\\s+)?increas\\w*", stem: "increas" },
  { match: "(?:to\\s+)?reduc\\w*", stem: "reduc" },
  { match: "(?:to\\s+)?boost\\w*", stem: "boost" },
  { match: "streamlin\\w*", stem: "streamlin" },
  { match: "(?:to\\s+)?ensur\\w*", stem: "ensur" },
  { match: "enabl(?:ing|es)", stem: "enabl" },
  { match: "resulting\\s+in", stem: "resulting in" },
  { match: "leading\\s+to", stem: "leading to" },
  { match: "delivering", stem: "deliver" },
  { match: "driving", stem: "driv" },
  { match: "for\\s+better", stem: "better" },
  // Collaboration / scope claims.
  { match: "collaborat\\w*\\s+with", stem: "collaborat" },
  { match: "partnered\\s+with", stem: "partner" },
  { match: "worked\\s+closely\\s+with", stem: "closely" },
  { match: "cross-functional", stem: "cross-functional" },
  { match: "stakeholders?", stem: "stakeholder" },
  { match: "across\\s+the\\s+(?:team|organi[sz]ation|company)", stem: "across the" },
  { match: "end-to-end", stem: "end-to-end" },
  { match: "production", stem: "production" },
  { match: "at\\s+scale", stem: "scale" },
  { match: "high-traffic", stem: "high-traffic" },
  { match: "enterprise", stem: "enterprise" },
];

const MAX_PHRASE = 60;

const COMPILED = TRIGGERS.map((t) => ({
  find: new RegExp(`\\b${t.match}`, "gi"),
  stem: t.stem,
}));

/** Cut to a short phrase, preferring a word boundary. */
function shorten(phrase: string): string {
  if (phrase.length <= MAX_PHRASE) return phrase;
  const cut = phrase.slice(0, MAX_PHRASE);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:-]+$/, "");
}

/**
 * Short phrases in `after` that make an outcome or collaboration/scope claim
 * absent from `before`. Each phrase runs from the trigger to the next comma,
 * semicolon or period. Plain verb swaps ("Worked on" -> "Built") never match.
 */
export function findNewClaims(before: string, after: string): string[] {
  const oldText = before.toLowerCase();
  const hits: Array<{ start: number; end: number }> = [];

  for (const { find, stem } of COMPILED) {
    if (oldText.includes(stem)) continue;
    find.lastIndex = 0;
    for (const m of after.matchAll(find)) {
      const start = m.index ?? 0;
      const rest = after.slice(start);
      const stop = rest.search(/[,;.]/);
      hits.push({ start, end: stop === -1 ? after.length : start + stop });
    }
  }

  hits.sort((a, b) => a.start - b.start);
  const phrases: string[] = [];
  let covered = -1;
  for (const hit of hits) {
    // Two triggers in one clause are one claim.
    if (hit.start < covered) continue;
    covered = hit.end;
    const phrase = shorten(after.slice(hit.start, hit.end).trim());
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  }
  return phrases;
}
