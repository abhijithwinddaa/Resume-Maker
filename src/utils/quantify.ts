/**
 * "Quantify with me": turn a bullet with no result into one with the user's
 * own number. The user picks what changed and roughly how much; nothing here
 * (or in the AI rewrite) may add a number they did not give.
 */

export type RoleFamily = "engineering" | "data" | "sales" | "operations" | "student" | "general";

export type ChangeTypeId =
  | "faster"
  | "users"
  | "quality"
  | "time"
  | "money"
  | "cost"
  | "scale"
  | "team"
  | "rank";

export interface ChangeType {
  id: ChangeTypeId;
  /** Chip label: what changed. */
  label: string;
  /** Step-two question: roughly how much. */
  question: string;
  /** Clause appended to the bullet when the AI is unavailable. */
  template: (amount: string) => string;
  /** Fill-in blank used when the user is not sure yet. */
  blank: string;
}

export interface ChangeIdea extends ChangeType {
  /** Example amount for this role, shown as the input placeholder. */
  example: string;
}

export const CHANGE_TYPES: ChangeType[] = [
  { id: "faster", label: "Made it faster", question: "How much faster?", template: (a) => `making it ${a} faster`, blank: "[X%]" },
  { id: "users", label: "More people used it", question: "Roughly how many people?", template: (a) => `used by ${a} users`, blank: "[N]" },
  { id: "quality", label: "Fewer errors or bugs", question: "Roughly how many fewer?", template: (a) => `reducing errors by ${a}`, blank: "[X%]" },
  { id: "time", label: "Saved time", question: "How much time saved?", template: (a) => `saving ${a}`, blank: "[N] hours a week" },
  { id: "money", label: "Brought in money", question: "Roughly how much revenue?", template: (a) => `bringing in ${a}`, blank: "[$X]" },
  { id: "cost", label: "Cut costs", question: "Roughly how much saved?", template: (a) => `cutting costs by ${a}`, blank: "[X%]" },
  { id: "scale", label: "Handled more volume", question: "How much volume?", template: (a) => `handling ${a}`, blank: "[N] requests a day" },
  { id: "team", label: "Led or trained people", question: "How many people?", template: (a) => `leading a team of ${a}`, blank: "[N]" },
  { id: "rank", label: "Won or ranked", question: "Where did it place?", template: (a) => `placing ${a}`, blank: "[N]th of [N] teams" },
];

const ORDER: Record<RoleFamily, ChangeTypeId[]> = {
  engineering: ["faster", "users", "quality", "scale", "time", "cost", "team", "money", "rank"],
  data: ["time", "faster", "quality", "scale", "money", "cost", "users", "team", "rank"],
  sales: ["money", "users", "time", "cost", "team", "rank", "scale", "faster", "quality"],
  operations: ["time", "cost", "quality", "scale", "team", "faster", "users", "money", "rank"],
  student: ["users", "rank", "faster", "quality", "team", "time", "scale", "money", "cost"],
  general: ["time", "users", "quality", "money", "cost", "faster", "scale", "team", "rank"],
};

const EXAMPLES: Record<RoleFamily, Partial<Record<ChangeTypeId, string>>> = {
  engineering: { faster: "40%, or 3s → 1s", users: "10k monthly users", quality: "60% fewer bugs", scale: "2M requests a day", time: "5 hours a week" },
  data: { time: "6 hours of manual work a week", faster: "queries 5x faster", quality: "30% fewer data errors", scale: "50M rows a day", money: "$200k in decisions" },
  sales: { money: "$250k in new revenue, or 120% of quota", users: "40 new accounts", time: "3 days off the sales cycle", rank: "#1 of 12 reps" },
  operations: { time: "10 hours a week", cost: "15%, or $8k a year", quality: "half the escalations", scale: "300 tickets a week", team: "6 people" },
  student: { users: "200 students on campus", rank: "1st of 40 teams", faster: "2x faster than the old version", quality: "a 95% test pass rate", team: "4 classmates" },
  general: {},
};

const GENERIC_EXAMPLES: Record<ChangeTypeId, string> = {
  faster: "30%, or 2 days → 1 day",
  users: "500 people",
  quality: "25% fewer errors",
  time: "4 hours a week",
  money: "$50k",
  cost: "10%, or $5k a year",
  scale: "1,000 orders a week",
  team: "5 people",
  rank: "top 3 of 30",
};

const STUDENT = /\b(?:intern(?:ship)?|student|trainee|graduate|fresher|undergrad|apprentice)\b/i;
const DATA = /\b(?:data|analyst|analytics|machine learning|ml|ai engineer|scientist|bi)\b/i;
const SALES = /\b(?:sales|account (?:executive|manager)|business development|bdr|sdr|marketing|growth|partnerships)\b/i;
const ENGINEERING = /\b(?:engineer(?:ing)?|developer|programmer|front[- ]?end|back[- ]?end|full[- ]?stack|devops|sre|software|mobile|web|qa|architect)\b/i;
const OPERATIONS = /\b(?:operations|ops|coordinator|support|customer success|project manager|program manager|administrator|admin|hr|recruit(?:er|ing)|logistics|finance|accountant)\b/i;
const TECH_STACK = /\b(?:react|vue|angular|node|python|java|typescript|javascript|go|rust|c\+\+|c#|kotlin|swift|firebase|aws|docker|sql|django|flask|spring|next\.?js)\b/i;

/** Rough role family from a job title (and, for projects, the tech stack). */
export function detectRoleFamily(role: string, techStack = ""): RoleFamily {
  if (STUDENT.test(role)) return "student";
  if (DATA.test(role)) return "data";
  if (SALES.test(role)) return "sales";
  if (ENGINEERING.test(role)) return "engineering";
  if (OPERATIONS.test(role)) return "operations";
  if (TECH_STACK.test(techStack)) return "engineering";
  return "general";
}

/** Every change type, ordered by what matters most for the role. */
export function metricIdeasFor(family: RoleFamily): ChangeIdea[] {
  return ORDER[family].map((id) => {
    const type = CHANGE_TYPES.find((t) => t.id === id)!;
    return { ...type, example: EXAMPLES[family][id] ?? GENERIC_EXAMPLES[id] };
  });
}

function changeType(id: ChangeTypeId): ChangeType {
  return CHANGE_TYPES.find((t) => t.id === id)!;
}

function stem(bullet: string): string {
  return bullet.trim().replace(/[.;,\s]+$/, "");
}

/** Deterministic rewrite: the bullet plus the user's own result. */
export function buildTemplateBullet(bullet: string, id: ChangeTypeId, amount: string): string {
  return `${stem(bullet)}, ${changeType(id).template(amount.trim())}`;
}

/** The bullet with a fill-in blank the user must complete before export. */
export function insertBlank(bullet: string, id: ChangeTypeId): string {
  const type = changeType(id);
  return `${stem(bullet)}, ${type.template(type.blank)}`;
}

const PLACEHOLDER = /\[(?:X|N|#|\$X|N(?:th)?)%?\]/;

export function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER.test(text);
}

const NUMBER = /\d+(?:[.,]\d+)*/g;

function numbersIn(text: string): string[] {
  return (text.match(NUMBER) || []).map((n) => n.replace(/,/g, ""));
}

/** True when every number in `output` appears in one of the user's own texts. */
export function numbersGrounded(output: string, sources: string[]): boolean {
  const known = new Set(sources.flatMap(numbersIn));
  return numbersIn(output).every((n) => known.has(n));
}
