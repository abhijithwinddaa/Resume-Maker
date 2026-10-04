import type { ResumeData } from "../types/resume.js";
import type { ATSResult } from "../server/aiParsing.js";
import {
  buildOptimizationWritingContract,
  buildQualitySignalsBlock,
  OPTIMIZE_PROMPT_VERSION,
} from "./optimizePromptShared.js";

export function buildOptimizePrompt(
  resumeData: ResumeData,
  jobDescription: string,
  atsReport: ATSResult,
  iteration: number,
): string {
  const missingKeywords =
    atsReport.breakdown.keywordMatch.missingKeywords?.join(", ") || "none";
  const missingSkills =
    atsReport.breakdown.skillsAlignment.missingSkills?.join(", ") || "none";
  const suggestions = atsReport.topSuggestions
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
  const qualitySignals = buildQualitySignalsBlock(atsReport);
  const writingContract = buildOptimizationWritingContract();

  return `You are an expert ATS resume optimizer. This is optimization iteration #${iteration}.
Prompt version: ${OPTIMIZE_PROMPT_VERSION}.

## CONTEXT
The resume was scanned against an ATS system and scored **${atsReport.overallScore}/100**.
The target is **95+/100** — but only through truthful edits. A lower score on an
honest resume beats a higher score on one the candidate cannot defend in an interview.

## ATS SCAN REPORT
- **Overall Score**: ${atsReport.overallScore}/100
- **Keyword Match**: ${atsReport.breakdown.keywordMatch.score}/100 — ${atsReport.breakdown.keywordMatch.feedback}
- **Skills Alignment**: ${atsReport.breakdown.skillsAlignment.score}/100 — ${atsReport.breakdown.skillsAlignment.feedback}
- **Experience Relevance**: ${atsReport.breakdown.experienceRelevance.score}/100 — ${atsReport.breakdown.experienceRelevance.feedback}
- **Formatting**: ${atsReport.breakdown.formatting.score}/100 — ${atsReport.breakdown.formatting.feedback}
- **Impact & Metrics**: ${atsReport.breakdown.impact.score}/100 — ${atsReport.breakdown.impact.feedback}

## MISSING KEYWORDS (ADD ONLY WITH EVIDENCE)
${missingKeywords}

## MISSING SKILLS (ADD ONLY WITH EVIDENCE)
${missingSkills}

## SUGGESTIONS TO IMPLEMENT
${suggestions}

## LOCAL QUALITY SIGNALS (DETERMINISTIC CHECKS)
${qualitySignals}

## WRITING CONTRACT
${writingContract}

## CRITICAL INSTRUCTIONS
1. **Missing keywords: use one only where the existing resume already shows evidence for it** — the same tool under another name ("GitHub Actions" → "CI/CD"), a direct synonym, or work that plainly is that thing ("led a 3-person team" → "mentoring"). Surface it in the bullet that holds the evidence.
2. **No evidence? Leave it out** — out of bullets, summary AND skills. Never add a tool, platform, or skill the resume gives no sign the candidate has used. The ATS report already shows the candidate those gaps.
3. **Implement the suggestions** — when they can be done truthfully.
4. **Use strong action verbs** — Started, Built, Designed, Implemented, Optimized, Deployed, Architected, Led, Scaled, Reduced, Automated, etc.
5. **Never introduce a number** — reuse the metrics, counts, and years already in the resume. Do not estimate, round up, or add new percentages, user counts, or years of experience.
6. **Summary** — Front-load the summary with JD-relevant terms the candidate genuinely has.
7. **Keep it truthful** — Rephrase and enhance, but don't fabricate experience the candidate doesn't have.
8. **Education & Contact** — Keep as-is. NEVER remove or change any URLs/links.
9. **The resume MUST fit on a single page** — Be concise. Each bullet point should be 1-2 lines max.
10. **Truthfulness outranks keyword coverage** — when the two conflict, keep the resume honest.
11. **Experience section** — If present, optimize bullets to include JD keywords using the writing contract rather than keyword stuffing.
12. **sectionOrder** — Keep the same section order.
13. **PRESERVE ALL LINKS** — Keep ALL githubLink, liveLink, linkedin, github, portfolio, and certificate link values EXACTLY as they are. Never empty or modify URLs.
14. **Output ONLY valid JSON** — No markdown, no code fences, no explanation.

## RESUME JSON SCHEMA
{
  "contact": { "name": string, "phone": string, "email": string, "linkedin": string, "github": string, "portfolio": string },
  "summary": string,
  "education": [{ "university": string, "location": string, "degree": string, "yearRange": string, "cgpa": string }],
  "experience": [{ "company": string, "role": string, "location": string, "dateRange": string, "bullets": [string] }],
  "showExperience": boolean,
  "projects": [{ "title": string, "githubLink": string, "liveLink": string, "techStack": string, "bullets": [string] }],
  "skills": [{ "label": string, "skills": string }],
  "achievements": [{ "text": string, "githubLink": string }],
  "certificates": [{ "name": string, "description": string, "link": string }],
  "showCertificates": boolean,
  "sectionOrder": ["summary", "education", "experience", "projects", "skills", "achievements", "certificates"]
}

## CURRENT RESUME DATA
${JSON.stringify(resumeData, null, 2)}

## TARGET JOB DESCRIPTION
${jobDescription}

## OUTPUT
Return ONLY the rewritten resume as a valid JSON object. No other text.`;
}
