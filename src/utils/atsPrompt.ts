import type { ResumeData } from "../types/resume";

export function buildATSPrompt(
  resumeData: ResumeData,
  jobDescription: string,
): string {
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

  return `You are an expert ATS (Applicant Tracking System) analyzer. Score the following resume against the given job description.

## CRITICAL KEYWORD EXTRACTION RULES
You MUST extract EVERY SINGLE keyword from the job description. This includes:
1. **Hard skills / Technologies**: Every programming language, framework, library, tool, platform, database, cloud service mentioned (e.g., React, Node.js, AWS, Docker, Kubernetes, PostgreSQL, Redis)
2. **Soft skills**: communication, leadership, teamwork, problem-solving, etc.
3. **Domain terms**: machine learning, CI/CD, microservices, agile, scrum, REST API, GraphQL, etc.
4. **Job-specific phrases**: "cross-functional teams", "stakeholder management", "production systems", etc.
5. **Certifications & qualifications**: AWS Certified, PMP, any mentioned cert
6. **Action verbs from requirements**: design, implement, deploy, optimize, mentor, lead, etc.
7. **Industry terms**: SaaS, B2B, fintech, e-commerce, etc.
8. **Experience levels**: "3+ years", "senior", "lead", etc.
9. **Methodologies**: TDD, BDD, Agile, Kanban, DevOps, etc.
10. **Acronyms AND their full forms**: both "ML" and "Machine Learning", both "CI/CD" and "Continuous Integration/Continuous Deployment"

Do NOT miss any keyword. Extract at minimum 30-50 keywords from a typical JD. If the JD is long, extract 50-100+.

Analyze the resume comprehensively and return a JSON object with this EXACT structure:
{
  "overallScore": <number 0-100>,
  "breakdown": {
    "keywordMatch": {
      "score": <number 0-100>,
      "weight": 35,
      "matchedKeywords": ["every single matched keyword/phrase"],
      "missingKeywords": ["every single missing keyword/phrase"],
      "feedback": "<brief feedback>"
    },
    "skillsAlignment": {
      "score": <number 0-100>,
      "weight": 25,
      "matchedSkills": ["every matched technical/soft skill"],
      "missingSkills": ["every missing technical/soft skill"],
      "feedback": "<brief feedback>"
    },
    "experienceRelevance": {
      "score": <number 0-100>,
      "weight": 20,
      "feedback": "<brief feedback on how well projects/experience align>"
    },
    "formatting": {
      "score": <number 0-100>,
      "weight": 10,
      "feedback": "<brief feedback on resume structure/format quality>"
    },
    "impact": {
      "score": <number 0-100>,
      "weight": 10,
      "feedback": "<brief feedback on quantified achievements and action verbs>"
    }
  },
  "topSuggestions": [
    "<suggestion 1>",
    "<suggestion 2>",
    "<suggestion 3>",
    "<suggestion 4>",
    "<suggestion 5>"
  ],
  "summaryVerdict": "<2-3 sentence overall assessment>"
}

SCORING RULES:
- overallScore = weighted average of all breakdown scores using the given weights
- keywordMatch (35%): How many JD keywords/phrases appear in the resume. List EVERY found and missing keyword.
- skillsAlignment (25%): How well listed skills match JD requirements. List EVERY found and missing skill.
- experienceRelevance (20%): How relevant projects/experience are to the role
- formatting (10%): Resume structure, readability, ATS-friendly format
- impact (10%): Use of action verbs, quantified results, measurable achievements

Be strict but fair. A perfect resume rarely scores above 90.

---

JOB DESCRIPTION:
${jobDescription}

---

RESUME:
${resumeText}

---

Return ONLY the JSON object. No markdown, no explanation, no code fences.`;
}
