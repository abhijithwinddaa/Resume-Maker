import type { ResumeData } from "../types/resume";
import type { ATSResult } from "./aiService";

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

  return `You are an expert ATS resume optimizer. This is optimization iteration #${iteration}.

## CONTEXT
The resume was scanned against an ATS system and scored **${atsReport.overallScore}/100**.
The target is **95+/100**. You MUST aggressively fix ALL issues identified below.

## ATS SCAN REPORT
- **Overall Score**: ${atsReport.overallScore}/100
- **Keyword Match**: ${atsReport.breakdown.keywordMatch.score}/100 — ${atsReport.breakdown.keywordMatch.feedback}
- **Skills Alignment**: ${atsReport.breakdown.skillsAlignment.score}/100 — ${atsReport.breakdown.skillsAlignment.feedback}
- **Experience Relevance**: ${atsReport.breakdown.experienceRelevance.score}/100 — ${atsReport.breakdown.experienceRelevance.feedback}
- **Formatting**: ${atsReport.breakdown.formatting.score}/100 — ${atsReport.breakdown.formatting.feedback}
- **Impact & Metrics**: ${atsReport.breakdown.impact.score}/100 — ${atsReport.breakdown.impact.feedback}

## MISSING KEYWORDS (MUST ADD THESE)
${missingKeywords}

## MISSING SKILLS (MUST ADD THESE)
${missingSkills}

## SUGGESTIONS TO IMPLEMENT
${suggestions}

## CRITICAL INSTRUCTIONS
1. **Add ALL missing keywords** — Incorporate every missing keyword naturally into summary, project bullets, experience bullets, or skills.
2. **Add ALL missing skills** — Add them to the appropriate skill categories. If a skill is reasonable given the candidate's background, add it.
3. **Implement ALL suggestions** — Follow every suggestion from the ATS report.
4. **Use strong action verbs** — Started, Built, Designed, Implemented, Optimized, Deployed, Architected, etc.
5. **Quantify impact** — Add numbers, percentages, metrics wherever possible (e.g., "reduced load time by 40%", "served 10K+ users").
6. **Summary must be keyword-rich** — Front-load the summary with JD-relevant terms.
7. **Keep it truthful** — Rephrase and enhance, but don't fabricate experience the candidate doesn't have. Adding related skills they COULD know is fine.
8. **Education & Contact** — Keep as-is. NEVER remove or change any URLs/links.
9. **The resume MUST fit on a single page** — Be concise. Each bullet point should be 1-2 lines max.
10. **Every single missing keyword from the ATS report MUST appear somewhere in the output** — This is the #1 priority.
11. **Experience section** — If present, optimize bullets to include JD keywords.
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
