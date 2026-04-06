import type { ResumeData } from "../types/resume.js";
import type { ATSResult } from "../server/aiParsing.js";
import {
  buildOptimizationWritingContract,
  buildQualitySignalsBlock,
  OPTIMIZE_PROMPT_VERSION,
} from "./optimizePromptShared.js";

/**
 * Builds a prompt for AI-based self-optimization — no JD required.
 * Improves the resume based on general best practices: stronger bullets,
 * better metrics, clearer structure, and industry keyword enrichment.
 */
export function buildSelfOptimizePrompt(
  resumeData: ResumeData,
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

  return `You are an expert resume optimizer. This is optimization iteration #${iteration}.
Prompt version: ${OPTIMIZE_PROMPT_VERSION}.
There is NO specific job description — you are optimizing for GENERAL best practices and ATS readiness.

## CONTEXT
The resume was self-scored and got **${atsReport.overallScore}/100**.
The target is **90+/100**. You MUST aggressively improve ALL weak areas.

## SELF-ATS SCAN REPORT
- **Overall Score**: ${atsReport.overallScore}/100
- **Industry Keywords**: ${atsReport.breakdown.keywordMatch.score}/100 — ${atsReport.breakdown.keywordMatch.feedback}
- **Skills Presentation**: ${atsReport.breakdown.skillsAlignment.score}/100 — ${atsReport.breakdown.skillsAlignment.feedback}
- **Content Quality**: ${atsReport.breakdown.experienceRelevance.score}/100 — ${atsReport.breakdown.experienceRelevance.feedback}
- **ATS Formatting**: ${atsReport.breakdown.formatting.score}/100 — ${atsReport.breakdown.formatting.feedback}
- **Impact & Metrics**: ${atsReport.breakdown.impact.score}/100 — ${atsReport.breakdown.impact.feedback}

## MISSING INDUSTRY KEYWORDS (SHOULD ADD)
${missingKeywords}

## MISSING SKILLS (SHOULD ADD)
${missingSkills}

## SUGGESTIONS TO IMPLEMENT
${suggestions}

## LOCAL QUALITY SIGNALS (DETERMINISTIC CHECKS)
${qualitySignals}

## WRITING CONTRACT
${writingContract}

## CRITICAL INSTRUCTIONS
1. **Add missing industry keywords** — Incorporate them naturally into summary, project bullets, experience bullets, or skills.
2. **Add missing skills** — Add them to appropriate skill categories. Only add skills reasonable for the candidate's background.
3. **Implement ALL suggestions** — Follow every suggestion from the report.
4. **Use strong action verbs** — Built, Designed, Implemented, Optimized, Deployed, Architected, Led, Scaled, Reduced, Automated, etc.
5. **Quantify impact** — Add numbers, percentages, metrics wherever the resume provides enough evidence to do so truthfully.
6. **Summary must be strong** — Front-load with the candidate's top strengths and domain expertise.
7. **Keep it truthful** — Rephrase and enhance, but don't fabricate experience.
8. **Education & Contact** — Keep as-is. NEVER remove or change any URLs/links.
9. **The resume MUST fit on a single page** — Be concise. Each bullet point should be 1-2 lines max.
10. **Every missing keyword from the report MUST appear somewhere in the output** — This is the #1 priority, but add terms naturally.
11. **Experience section** — If present, optimize bullets with stronger action verbs and metrics using the writing contract.
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

## OUTPUT
Return ONLY the rewritten resume as a valid JSON object. No other text.`;
}
