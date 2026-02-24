export function buildResumeParsePrompt(resumeText: string): string {
  return `Parse the following resume text into a structured JSON object.

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
6. Keep bullet points concise, action-oriented, and impactful
7. Group skills into logical categories (Languages, Frameworks, Tools, Databases, etc.)
8. If no certificates section is found, use an empty array and set showCertificates to false
9. If URLs are found for LinkedIn, GitHub, Portfolio, or projects, include them; otherwise use empty strings
10. For contact info: extract name, phone, email from the header area of the resume
11. sectionOrder should reflect the order sections appear in the original resume
12. Return ONLY the JSON object — no markdown, no code fences, no explanation

RESUME TEXT:
${resumeText}`;
}
