export function buildResumeParsePrompt(
  resumeText: string,
  extractedLinks?: string[],
): string {
  const linksSection =
    extractedLinks && extractedLinks.length > 0
      ? `\n\n## EXTRACTED HYPERLINKS FROM THE PDF\nThese URLs were extracted from clickable links in the original PDF. You MUST map each URL to the correct field:\n${extractedLinks.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n`
      : "";

  return `Parse the following resume text into a structured JSON object.

## CRITICAL: PRESERVE ALL LINKS / URLs
This is the #1 priority. The user has links in their resume that are TIME-CONSUMING to re-add.
- Extract EVERY URL found in the text OR in the extracted hyperlinks section below
- LinkedIn URLs → contact.linkedin
- GitHub profile URLs (github.com/username with NO repo path) → contact.github
- Portfolio/website URLs → contact.portfolio
- Project GitHub URLs (github.com/username/repo) → project.githubLink
- Project live/demo URLs → project.liveLink
- Certificate URLs → certificate.link
- Achievement GitHub URLs → achievement.githubLink
- If a URL appears in both text and hyperlinks, include it
- NEVER leave a link field as empty string if a URL exists for it
${linksSection}
OUTPUT FORMAT — return ONLY valid JSON with this EXACT structure:
{
  "contact": {
    "name": "string",
    "phone": "string",
    "email": "string",
    "linkedin": "string (URL or empty string)",
    "github": "string (URL or empty string)",
    "portfolio": "string (URL or empty string)"
  },
  "summary": "string (professional summary)",
  "education": [
    {
      "university": "string",
      "location": "string (City, State)",
      "degree": "string",
      "yearRange": "string (e.g. 2020 - 2024)",
      "cgpa": "string (e.g. 3.8/4.0 or empty string)"
    }
  ],
  "experience": [
    {
      "company": "string",
      "role": "string (job title)",
      "location": "string (City, State or Remote)",
      "dateRange": "string (e.g. Jan 2023 - Present)",
      "bullets": ["string (achievement/responsibility bullet point)"]
    }
  ],
  "showExperience": boolean,
  "projects": [
    {
      "title": "string",
      "githubLink": "string (URL or empty string)",
      "liveLink": "string (URL or empty string)",
      "techStack": "string (comma-separated technologies)",
      "bullets": ["string (achievement/description bullet point)"]
    }
  ],
  "skills": [
    {
      "label": "string (category like Languages, Frameworks, Tools, Databases)",
      "skills": "string (comma-separated skills in this category)"
    }
  ],
  "achievements": [
    {
      "text": "string (achievement description)",
      "githubLink": ""
    }
  ],
  "certificates": [
    {
      "name": "string",
      "description": "string",
      "link": "string (URL or empty string)"
    }
  ],
  "showCertificates": boolean,
  "sectionOrder": ["summary", "education", "experience", "projects", "skills", "achievements", "certificates"]
}

PARSING RULES:
1. Extract ALL information from the resume text — do not skip anything
2. If the resume has a WORK EXPERIENCE or PROFESSIONAL EXPERIENCE section, put those entries in "experience" array and set "showExperience" to true
3. If there is NO work experience section, set "experience" to [] and "showExperience" to false
4. Personal projects (not work) go into "projects" array
5. For techStack: list all technologies, tools, and frameworks mentioned in each project
6. Keep bullet points EXACTLY as they appear — do NOT rephrase, shorten, or "improve" them. Preserve the original wording.
7. Group skills into logical categories (Languages, Frameworks, Tools, Databases, etc.)
8. If no certificates section is found, use an empty array and set showCertificates to false
9. **LINKS ARE CRITICAL** — Extract ALL URLs: LinkedIn, GitHub profile, portfolio, project GitHub links, project live demo links, certificate links, achievement links. Check both the resume text AND the "EXTRACTED HYPERLINKS" section above. Map each URL to the correct field. This is the user's #1 priority.
10. For contact info: extract name, phone, email from the header area of the resume
11. sectionOrder should reflect the order sections appear in the original resume
12. Keep the resume summary/objective EXACTLY as written — do not change wording
13. Return ONLY the JSON object — no markdown, no code fences, no explanation

RESUME TEXT:
${resumeText}`;
}
