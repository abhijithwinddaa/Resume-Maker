import { VAGUE_BULLET_PATTERNS, WEAK_BULLET_PATTERNS } from "./resumeFeedback";

/**
 * On-device STAR/XYZ check for a single bullet: "Did X (action), using/for Y
 * (scope), resulting in Z (result)". No AI — runs on every keystroke.
 */

export type CheckStatus = "pass" | "partial" | "fail";

export interface BulletCheck {
  status: CheckStatus;
  /** One line telling the user how to fix it; empty when it passes. */
  tip: string;
}

export interface BulletAnalysis {
  empty: boolean;
  checks: { action: BulletCheck; scope: BulletCheck; result: BulletCheck };
  /** 0–3: one per passed check, half for a partial. */
  score: number;
}

// Irregular past tenses and common present-tense verbs (current roles). Most
// regular past tenses are caught by the "-ed" rule below.
const ACTION_VERBS = new Set(
  `built rebuilt led grew cut ran wrote rewrote drove won made set took brought
  taught sold spun began oversaw undertook upheld shipped
  build lead grow cut run write drive own design develop create launch ship
  manage mentor deliver implement architect automate reduce increase improve
  migrate optimize optimise scale maintain analyze analyse coordinate organize
  organise train sell negotiate present research test deploy refactor integrate
  establish streamline resolve support teach plan`.split(/\s+/),
);

const PAST_TENSE = /^[a-z]{3,}ed$/;

// "using X", "with X", "via X", "in React", "for 30 clients"…
const METHOD_MARKER =
  /\b(?:using|with|via|through|by (?:\w+ing)|leveraging|powered by|built on|in (?:[A-Z]|\w+\.js)|for (?:[A-Z]|\d|the \w+ team|\w+ (?:clients|customers|users|students|teams)))/;
const CAPITALIZED_AFTER_FIRST = /\s(?:[A-Z][\w.+#-]*|[A-Z]{2,}|\w+\.(?:js|py|io|net))\b/;

const OUTCOME_WORDS =
  /\b(?:improv|increas|reduc|cut(?:ting)?\b|grew|grow|boost|faster|quicker|sav(?:ed|ing|es)|lower|decreas|accelerat|eliminat|streamlin|enabl|result(?:ed|ing) in|leading to|so that|doubl|tripl|halv|won|ranked|adopted|raised|generat|expand)/i;

const NOT_A_UNIT = new Set(
  `and or the to in of with using at on a an by from for as since until
  january february march april may june july august september october november december
  jan feb mar apr jun jul aug sep sept oct nov dec`.split(/\s+/),
);

function isYear(token: string): boolean {
  return /^(?:19|20)\d\d$/.test(token);
}

/** True when the bullet states a measurable amount (not just a date or version). */
export function hasMetric(text: string): boolean {
  if (/\$\s?\d|\d\s?%|\b\d+(?:\.\d+)?\s?[xX]\b|\b\d[\d,.]*\s?[kKmMbB]\+?\b/.test(text)) {
    return true;
  }
  const re = /\b(\d[\d,.]*)\+?\s+([a-zA-Z]+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (isYear(m[1])) continue;
    if (!NOT_A_UNIT.has(m[2].toLowerCase())) return true;
  }
  return false;
}

function firstWord(text: string): string {
  return (text.match(/^[^\w]*([A-Za-z'-]+)/)?.[1] ?? "").toLowerCase();
}

function checkAction(text: string): BulletCheck {
  const word = firstWord(text);
  if (word === "i" || word === "my" || word === "we") {
    return { status: "fail", tip: `Drop "${word === "i" ? "I" : word}" — start with the verb, e.g. "Built" or "Led".` };
  }
  const weak = WEAK_BULLET_PATTERNS.find((pattern) => pattern.test(text));
  if (weak) {
    const opener = text.match(weak)?.[0] ?? word;
    return {
      status: "fail",
      tip: `Swap "${opener}" for what you did: "Built", "Led", "Reduced", "Launched"…`,
    };
  }
  if (ACTION_VERBS.has(word) || PAST_TENSE.test(word)) return { status: "pass", tip: "" };
  return {
    status: "partial",
    tip: "Start with an action verb, e.g. \"Built\", \"Led\", \"Reduced\".",
  };
}

function checkScope(text: string): BulletCheck {
  const words = text.split(/\s+/).filter(Boolean).length;
  const vague = VAGUE_BULLET_PATTERNS.find((pattern) => pattern.test(text));
  if (vague) {
    return {
      status: "partial",
      tip: `"${text.match(vague)?.[0]}" is vague — name the actual thing you worked on.`,
    };
  }
  const named = METHOD_MARKER.test(text) || CAPITALIZED_AFTER_FIRST.test(text) || hasMetric(text);
  if (named && words >= 5) return { status: "pass", tip: "" };
  if (words >= 9) {
    return { status: "partial", tip: "Name the tool, method or who it was for (\"using Python\", \"for 3 clients\")." };
  }
  return { status: "fail", tip: "Say what you worked on and how — the tool, method or who it was for." };
}

function checkResult(text: string): BulletCheck {
  if (hasMetric(text)) return { status: "pass", tip: "" };
  if (OUTCOME_WORDS.test(text)) {
    return { status: "partial", tip: "Good outcome — now say how much: a number, % or time saved." };
  }
  return { status: "fail", tip: "Add the result: what changed because of your work, and roughly how much?" };
}

const POINTS: Record<CheckStatus, number> = { pass: 1, partial: 0.5, fail: 0 };

export function analyzeBullet(raw: string): BulletAnalysis {
  const text = raw.trim();
  if (!text) {
    const blank: BulletCheck = { status: "fail", tip: "" };
    return { empty: true, checks: { action: blank, scope: blank, result: blank }, score: 0 };
  }
  const checks = { action: checkAction(text), scope: checkScope(text), result: checkResult(text) };
  const score = POINTS[checks.action.status] + POINTS[checks.scope.status] + POINTS[checks.result.status];
  return { empty: false, checks, score };
}
