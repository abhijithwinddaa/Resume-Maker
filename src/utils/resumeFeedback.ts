import type { ResumeData } from "../types/resume";

export type ResumeFeedbackStatus = "good" | "warning" | "critical";

export interface ResumeFeedbackSignal {
  id: "metrics" | "weak-bullets" | "vague-bullets" | "repetition" | "summary";
  title: string;
  status: ResumeFeedbackStatus;
  summary: string;
  details: string[];
}

export interface ResumeFeedbackInsights {
  signals: ResumeFeedbackSignal[];
  suggestedEdits: string[];
}

interface AnalyzeResumeFeedbackOptions {
  missingKeywords?: string[];
  matchedKeywords?: string[];
}

interface BulletRecord {
  section: string;
  text: string;
  normalized: string;
  starter: string;
  words: string[];
}

const METRIC_PATTERN =
  /\b(?:\$?\d[\d,.]*(?:\.\d+)?%?|\d+(?:\.\d+)?\s?(?:x|X|k|m|b|ms|s|sec|secs|seconds|min|mins|minutes|hr|hrs|hours|days|weeks|months|years|users?|customers?|clients?|requests?|tickets?|projects?|features?|pipelines?|services?|deployments?|tests?|queries?|records?|students?|team members?|engineers?))\b/;

const WEAK_BULLET_PATTERNS = [
  /^responsible for\b/i,
  /^worked on\b/i,
  /^worked with\b/i,
  /^helped\b/i,
  /^assisted\b/i,
  /^supported\b/i,
  /^involved in\b/i,
  /^participated in\b/i,
  /^handled\b/i,
  /^tasked with\b/i,
  /^did\b/i,
];

const VAGUE_BULLET_PATTERNS = [
  /\bvarious\b/i,
  /\bmultiple tasks\b/i,
  /\betc\.?\b/i,
  /\band more\b/i,
  /\bas needed\b/i,
  /\bduties included\b/i,
  /\bother responsibilities\b/i,
  /\bmiscellaneous\b/i,
  /\bseveral\b/i,
  /\bhelped with\b/i,
];

const GENERIC_SUMMARY_PHRASES = [
  "results-driven",
  "highly motivated",
  "detail-oriented",
  "team player",
  "hard-working",
  "hardworking",
  "self-starter",
  "fast learner",
  "passionate professional",
  "dynamic professional",
  "proven track record",
  "works well under pressure",
];

function normalizeText(text: string): string {
  return text.trim().replace(/^[\s\-*•]+/, "").replace(/\s+/g, " ");
}

function getBulletStarter(normalized: string): string {
  const firstWord = normalized.split(/\s+/)[0] || "";
  return firstWord.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getAllBullets(resumeData: ResumeData): BulletRecord[] {
  const bullets: BulletRecord[] = [];

  for (const experience of resumeData.experience) {
    for (const bullet of experience.bullets) {
      const normalized = normalizeText(bullet);
      if (!normalized) continue;
      bullets.push({
        section: "Experience",
        text: bullet,
        normalized,
        starter: getBulletStarter(normalized),
        words: normalized.split(/\s+/),
      });
    }
  }

  for (const project of resumeData.projects) {
    for (const bullet of project.bullets) {
      const normalized = normalizeText(bullet);
      if (!normalized) continue;
      bullets.push({
        section: "Projects",
        text: bullet,
        normalized,
        starter: getBulletStarter(normalized),
        words: normalized.split(/\s+/),
      });
    }
  }

  for (const achievement of resumeData.achievements) {
    const normalized = normalizeText(achievement.text);
    if (!normalized) continue;
    bullets.push({
      section: "Achievements",
      text: achievement.text,
      normalized,
      starter: getBulletStarter(normalized),
      words: normalized.split(/\s+/),
    });
  }

  for (const volunteer of resumeData.volunteer || []) {
    for (const bullet of volunteer.bullets) {
      const normalized = normalizeText(bullet);
      if (!normalized) continue;
      bullets.push({
        section: "Volunteer",
        text: bullet,
        normalized,
        starter: getBulletStarter(normalized),
        words: normalized.split(/\s+/),
      });
    }
  }

  return bullets;
}

function uniqueList(items: string[], maxItems = 5): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }

  return result;
}

function getMetricsSignal(bullets: BulletRecord[]): ResumeFeedbackSignal {
  if (bullets.length === 0) {
    return {
      id: "metrics",
      title: "Metrics Coverage",
      status: "critical",
      summary: "Add bullet points that show outcomes before relying on ATS scoring.",
      details: ["Your resume needs measurable bullets in experience or projects."],
    };
  }

  const bulletsWithMetrics = bullets.filter((bullet) =>
    METRIC_PATTERN.test(bullet.normalized),
  );
  const coverage = bulletsWithMetrics.length / bullets.length;

  if (coverage >= 0.6) {
    return {
      id: "metrics",
      title: "Metrics Coverage",
      status: "good",
      summary: `${bulletsWithMetrics.length} of ${bullets.length} bullets include numbers or scope signals.`,
      details: [
        "Your resume already shows outcomes in a healthy share of bullet points.",
      ],
    };
  }

  const metricFreeExamples = bullets
    .filter((bullet) => !METRIC_PATTERN.test(bullet.normalized))
    .slice(0, 3)
    .map((bullet) => `${bullet.section}: ${bullet.normalized}`);

  return {
    id: "metrics",
    title: "Metrics Coverage",
    status: coverage >= 0.35 ? "warning" : "critical",
    summary: `${bulletsWithMetrics.length} of ${bullets.length} bullets include measurable evidence.`,
    details: [
      "Add percentages, counts, time saved, revenue impact, or scale where it is truthful.",
      ...metricFreeExamples,
    ],
  };
}

function getWeakBulletsSignal(bullets: BulletRecord[]): ResumeFeedbackSignal {
  const weakBullets = bullets.filter((bullet) =>
    WEAK_BULLET_PATTERNS.some((pattern) => pattern.test(bullet.normalized)),
  );

  if (weakBullets.length === 0) {
    return {
      id: "weak-bullets",
      title: "Bullet Openings",
      status: "good",
      summary: "Your bullets mostly start with direct action language.",
      details: ["Strong bullet openings help recruiters scan faster."],
    };
  }

  return {
    id: "weak-bullets",
    title: "Bullet Openings",
    status: weakBullets.length >= 3 ? "critical" : "warning",
    summary: `${weakBullets.length} bullets open with weak phrases like "worked on" or "responsible for".`,
    details: weakBullets
      .slice(0, 4)
      .map((bullet) => `${bullet.section}: ${bullet.normalized}`),
  };
}

function getVagueBulletsSignal(bullets: BulletRecord[]): ResumeFeedbackSignal {
  const vagueBullets = bullets.filter(
    (bullet) =>
      bullet.words.length < 8 ||
      VAGUE_BULLET_PATTERNS.some((pattern) => pattern.test(bullet.normalized)),
  );

  if (vagueBullets.length === 0) {
    return {
      id: "vague-bullets",
      title: "Specificity",
      status: "good",
      summary: "Most bullets have enough detail to show context and scope.",
      details: ["Specific bullets are easier to trust and easier to rank."],
    };
  }

  return {
    id: "vague-bullets",
    title: "Specificity",
    status: vagueBullets.length >= 3 ? "critical" : "warning",
    summary: `${vagueBullets.length} bullets read as vague or too short to prove impact.`,
    details: vagueBullets
      .slice(0, 4)
      .map((bullet) => `${bullet.section}: ${bullet.normalized}`),
  };
}

function getRepetitionSignal(bullets: BulletRecord[]): ResumeFeedbackSignal {
  const counts = new Map<string, number>();

  for (const bullet of bullets) {
    if (!bullet.starter) continue;
    counts.set(bullet.starter, (counts.get(bullet.starter) || 0) + 1);
  }

  const repeatedStarters = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  if (repeatedStarters.length === 0) {
    return {
      id: "repetition",
      title: "Verb Variety",
      status: "good",
      summary: "Your bullet starters are varied enough to avoid sounding repetitive.",
      details: ["Varied verbs make the resume feel sharper and more believable."],
    };
  }

  const details = repeatedStarters.map(
    ([starter, count]) => `"${starter}" starts ${count} bullets`,
  );

  return {
    id: "repetition",
    title: "Verb Variety",
    status: repeatedStarters[0][1] >= 4 ? "critical" : "warning",
    summary: "Several bullets start the same way, which weakens the reading rhythm.",
    details,
  };
}

function getSummarySignal(
  resumeData: ResumeData,
  options: AnalyzeResumeFeedbackOptions,
): ResumeFeedbackSignal {
  const summary = normalizeText(resumeData.summary);

  if (!summary) {
    return {
      id: "summary",
      title: "Summary Quality",
      status: "critical",
      summary: "Your resume summary is empty.",
      details: [
        "Add a short role-targeted summary with your niche, years of experience, and strongest technologies.",
      ],
    };
  }

  const loweredSummary = summary.toLowerCase();
  const genericPhrases = GENERIC_SUMMARY_PHRASES.filter((phrase) =>
    loweredSummary.includes(phrase),
  );
  const matchedKeywordsInSummary = (options.matchedKeywords || []).filter(
    (keyword) => keyword.length > 2 && loweredSummary.includes(keyword.toLowerCase()),
  );

  const details: string[] = [];

  if (summary.length < 60) {
    details.push("The summary is very short; add role context and strongest proof points.");
  } else if (summary.length > 320) {
    details.push("The summary is long; tighten it so recruiters can scan it quickly.");
  }

  if (genericPhrases.length > 0) {
    details.push(
      `Generic phrases found: ${uniqueList(genericPhrases, 4).join(", ")}.`,
    );
  }

  if (
    options.matchedKeywords &&
    options.matchedKeywords.length > 0 &&
    matchedKeywordsInSummary.length < 2
  ) {
    details.push(
      "Your summary is not carrying enough target-role language from the job description.",
    );
  }

  if (details.length === 0) {
    return {
      id: "summary",
      title: "Summary Quality",
      status: "good",
      summary: "Your summary has usable detail without sounding overly generic.",
      details: ["Keep it targeted to the exact role you are applying for."],
    };
  }

  const status: ResumeFeedbackStatus =
    !summary || genericPhrases.length >= 2 ? "critical" : "warning";

  return {
    id: "summary",
    title: "Summary Quality",
    status,
    summary: "Your summary needs a tighter, more role-specific pitch.",
    details,
  };
}

function buildSuggestedEdits(signals: ResumeFeedbackSignal[]): string[] {
  const suggestions: string[] = [];

  for (const signal of signals) {
    if (signal.status === "good") continue;

    if (signal.id === "metrics") {
      suggestions.push(
        "Add measurable results to more bullets, especially in experience and projects.",
      );
    }
    if (signal.id === "weak-bullets") {
      suggestions.push(
        'Replace weak openings like "worked on" with direct action verbs and concrete outcomes.',
      );
    }
    if (signal.id === "vague-bullets") {
      suggestions.push(
        "Rewrite vague bullets so each one shows the task, the tools, and the result.",
      );
    }
    if (signal.id === "repetition") {
      suggestions.push(
        "Vary bullet starters so your experience reads less repetitively.",
      );
    }
    if (signal.id === "summary") {
      suggestions.push(
        "Tighten the summary so it is specific, role-targeted, and free of generic filler phrases.",
      );
    }
  }

  return uniqueList(suggestions, 5);
}

export function analyzeResumeFeedback(
  resumeData: ResumeData,
  options: AnalyzeResumeFeedbackOptions = {},
): ResumeFeedbackInsights {
  const bullets = getAllBullets(resumeData);
  const signals = [
    getMetricsSignal(bullets),
    getWeakBulletsSignal(bullets),
    getVagueBulletsSignal(bullets),
    getRepetitionSignal(bullets),
    getSummarySignal(resumeData, options),
  ];

  return {
    signals,
    suggestedEdits: buildSuggestedEdits(signals),
  };
}
