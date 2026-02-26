import type { ResumeData } from "../types/resume";

/**
 * Builds a prompt for AI-based self ATS scoring — no JD required.
 * Evaluates the resume on general best practices, industry readiness,
 * and ATS-compatibility.
 */
export function buildSelfATSPrompt(resumeData: ResumeData): string {
  const resumeText = `
Name: ${resumeData.contact.name}
Summary: ${resumeData.summary}

Skills:
${resumeData.skills.map((s) => `${s.label}: ${s.skills}`).join("\n")}

${resumeData.showExperience && resumeData.experience.length > 0 ? `Experience:\n${resumeData.experience.map((e) => `${e.role} at ${e.company}, ${e.location} (${e.dateRange})\n${e.bullets.map((b) => `- ${b}`).join("\n")}`).join("\n\n")}\n\n` : ""}Projects:
${resumeData.projects
  .map(
    (p) =>
      `${p.title} (${p.techStack})\n${p.bullets.map((b) => `- ${b}`).join("\n")}`,
  )
  .join("\n\n")}

Education:
${resumeData.education.map((e) => `${e.degree} at ${e.university}, ${e.location} (${e.yearRange}) - CGPA: ${e.cgpa}`).join("\n")}

Achievements:
${resumeData.achievements.map((a) => `- ${a.text}`).join("\n")}

${resumeData.showCertificates && resumeData.certificates.length > 0 ? `Certificates:\n${resumeData.certificates.map((c) => `- ${c.name}: ${c.description}`).join("\n")}` : ""}
  `.trim();

  return `You are an expert ATS (Applicant Tracking System) resume auditor. Score the following resume on GENERAL best practices — there is NO specific job description for this analysis.

## YOUR TASK
Evaluate this resume as if it were being passed through a generic ATS system. Score it on how ATS-friendly, professional, and impactful it is in GENERAL — not against any specific role.

## SCORING CATEGORIES

### 1. keywordMatch (weight 35%) — "Industry Keywords"
Identify the industry/domain the candidate belongs to based on their skills, projects, and experience. Then evaluate:
- How many industry-standard keywords/technologies appear?
- Are common tools, frameworks, languages, and methodologies for their field well represented?
- **matchedKeywords**: List all industry-relevant keywords/technologies already in the resume.
- **missingKeywords**: List important industry keywords the candidate SHOULD add given their apparent field and experience level. Look at their tech stack and suggest closely related technologies they likely know but didn't list.

### 2. skillsAlignment (weight 25%) — "Skills Presentation"
Evaluate the skills section quality:
- Are skills well-organized with clear categories?
- Are there enough skills listed? (At least 15-20 for tech roles)
- Is the mix of hard skills and soft skills appropriate?
- **matchedSkills**: Skills that are well-presented and relevant.
- **missingSkills**: Common skills for their domain that should be added.

### 3. experienceRelevance (weight 20%) — "Content Quality"
Evaluate the quality of experience and project descriptions:
- Are descriptions clear and relevant?
- Do bullets demonstrate progression and responsibility?
- Are projects well-described with clear outcomes?

### 4. formatting (weight 10%) — "ATS Formatting"
Evaluate ATS-friendliness:
- Is the structure clear with distinct sections?
- Are there any formatting red flags (inconsistent dates, missing info, etc.)?
- Is the length appropriate (not too long, not too short)?
- Are section headers standard (Education, Experience, Skills, Projects)?

### 5. impact (weight 10%) — "Impact & Metrics"
Evaluate whether the resume shows measurable impact:
- Does it use strong action verbs? (Built, Designed, Optimized, Deployed, etc.)
- Are there quantified results? (percentages, user counts, time saved, etc.)
- Does it show clear outcomes and business value?

## OUTPUT FORMAT
Return a JSON object with this EXACT structure:
{
  "overallScore": <number 0-100>,
  "breakdown": {
    "keywordMatch": {
      "score": <number 0-100>,
      "weight": 35,
      "matchedKeywords": ["every industry keyword found in resume"],
      "missingKeywords": ["important keywords they should add"],
      "feedback": "<brief feedback on industry keyword coverage>"
    },
    "skillsAlignment": {
      "score": <number 0-100>,
      "weight": 25,
      "matchedSkills": ["well-presented relevant skills"],
      "missingSkills": ["skills they should add for their domain"],
      "feedback": "<brief feedback on skills presentation>"
    },
    "experienceRelevance": {
      "score": <number 0-100>,
      "weight": 20,
      "feedback": "<brief feedback on content quality>"
    },
    "formatting": {
      "score": <number 0-100>,
      "weight": 10,
      "feedback": "<brief feedback on ATS formatting>"
    },
    "impact": {
      "score": <number 0-100>,
      "weight": 10,
      "feedback": "<brief feedback on metrics and action verbs>"
    }
  },
  "topSuggestions": [
    "<suggestion 1>",
    "<suggestion 2>",
    "<suggestion 3>",
    "<suggestion 4>",
    "<suggestion 5>"
  ],
  "summaryVerdict": "<2-3 sentence overall assessment of resume quality>"
}

SCORING RULES:
- overallScore = weighted average using the given weights
- Be strict but fair. A perfect resume rarely scores above 90.
- Focus on GENERAL best practices, NOT role-specific requirements.
- Identify the candidate's domain automatically from their resume content.

---

RESUME:
${resumeText}

---

Return ONLY the JSON object. No markdown, no explanation, no code fences.`;
}
