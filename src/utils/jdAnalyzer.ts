import type { ResumeData, JDAnalysis } from "../types/resume";

// Common filler words to ignore when extracting keywords
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "been",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "it",
  "its",
  "you",
  "your",
  "we",
  "our",
  "they",
  "their",
  "he",
  "she",
  "him",
  "her",
  "this",
  "that",
  "these",
  "those",
  "which",
  "what",
  "who",
  "whom",
  "when",
  "where",
  "how",
  "why",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "about",
  "above",
  "across",
  "after",
  "before",
  "between",
  "into",
  "through",
  "during",
  "without",
  "also",
  "well",
  "back",
  "being",
  "below",
  "etc",
  "including",
  "using",
  "working",
  "ability",
  "experience",
  "strong",
  "work",
  "team",
  "looking",
  "responsibilities",
  "requirements",
  "required",
  "preferred",
  "skills",
  "minimum",
  "years",
  "year",
  "plus",
  "role",
  "position",
  "job",
  "company",
  "will",
  "able",
  "new",
  "like",
  "understanding",
  "knowledge",
  "good",
  "up",
  "take",
  "over",
  "make",
  "get",
  "use",
  "one",
  "two",
  "three",
  "first",
  "second",
  "part",
  "time",
  "day",
  "way",
  "out",
  "long",
  "then",
  "them",
  "look",
  "come",
  "down",
  "right",
  "now",
  "find",
  "here",
  "thing",
  "many",
  "much",
  "us",
  "me",
  "him",
  "her",
  "re",
  "within",
  "across",
  "based",
  "high",
  "low",
  "end",
  "level",
  "key",
  "set",
]);

// Tech keywords and phrases to specifically look for
const TECH_PATTERNS = [
  // Languages
  "javascript",
  "typescript",
  "python",
  "java",
  "c\\+\\+",
  "c#",
  "go",
  "golang",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "r",
  "sql",
  "nosql",
  "graphql",
  // Frontend
  "react",
  "react\\.js",
  "reactjs",
  "angular",
  "vue",
  "vue\\.js",
  "vuejs",
  "next\\.js",
  "nextjs",
  "nuxt",
  "svelte",
  "html5?",
  "css3?",
  "sass",
  "scss",
  "less",
  "tailwind",
  "bootstrap",
  "material.ui",
  "redux",
  "mobx",
  "webpack",
  "vite",
  "babel",
  "responsive design",
  "spa",
  "pwa",
  "ssr",
  "ssg",
  // Backend
  "node\\.js",
  "nodejs",
  "express",
  "express\\.js",
  "fastify",
  "nest\\.js",
  "nestjs",
  "django",
  "flask",
  "spring",
  "spring boot",
  "asp\\.net",
  "ruby on rails",
  "rails",
  "rest",
  "restful",
  "rest api",
  "grpc",
  "microservices",
  "serverless",
  "lambda",
  // Database
  "mongodb",
  "postgresql",
  "postgres",
  "mysql",
  "redis",
  "elasticsearch",
  "dynamodb",
  "cassandra",
  "firebase",
  "supabase",
  "pinecone",
  "vector database",
  // Cloud & DevOps
  "aws",
  "azure",
  "gcp",
  "google cloud",
  "docker",
  "kubernetes",
  "k8s",
  "terraform",
  "jenkins",
  "ci/cd",
  "ci cd",
  "github actions",
  "gitlab",
  "vercel",
  "netlify",
  "heroku",
  "render",
  "linux",
  "nginx",
  // AI/ML
  "machine learning",
  "deep learning",
  "ai",
  "artificial intelligence",
  "nlp",
  "natural language processing",
  "llm",
  "gpt",
  "openai",
  "langchain",
  "rag",
  "embeddings",
  "vector",
  "neural network",
  "tensorflow",
  "pytorch",
  // Auth & Security
  "jwt",
  "oauth",
  "oauth2",
  "oauth 2\\.0",
  "authentication",
  "authorization",
  "owasp",
  "cors",
  "security",
  "encryption",
  "ssl",
  "tls",
  "https",
  // Testing
  "jest",
  "mocha",
  "cypress",
  "selenium",
  "testing",
  "unit testing",
  "integration testing",
  "e2e",
  "tdd",
  "bdd",
  // Tools & Concepts
  "git",
  "github",
  "jira",
  "agile",
  "scrum",
  "kanban",
  "postman",
  "swagger",
  "design patterns",
  "solid",
  "oop",
  "oops",
  "data structures",
  "algorithms",
  "system design",
  "scalable",
  "performance",
  "optimization",
  "caching",
  "websocket",
  "socket\\.io",
  "real.time",
  "api",
  "apis",
  // Soft skills (technical context)
  "full.stack",
  "fullstack",
  "frontend",
  "front.end",
  "backend",
  "back.end",
  "devops",
  "sre",
  "web development",
  "mobile development",
  "cross.platform",
  "clean code",
  "code review",
  "mentoring",
  "leadership",
];

function extractTechKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  const found: Set<string> = new Set();

  // Match technical patterns
  for (const pattern of TECH_PATTERNS) {
    const regex = new RegExp(`\\b${pattern}\\b`, "gi");
    const matches = lowerText.match(regex);
    if (matches) {
      // Normalize the keyword
      const normalized = matches[0]
        .replace(/\\.js/g, ".js")
        .replace(/\s+/g, " ")
        .trim();
      found.add(normalized);
    }
  }

  // Also extract multi-word phrases (2-3 words) that might be technical terms
  const words = text
    .replace(/[^\w\s.+#/-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`.toLowerCase();
    const triGram =
      i < words.length - 2
        ? `${words[i]} ${words[i + 1]} ${words[i + 2]}`.toLowerCase()
        : "";

    // Check if bigram contains at least one non-stop word
    const bigramWords = bigram.split(" ");
    if (
      bigramWords.some((w) => !STOP_WORDS.has(w)) &&
      bigramWords.every((w) => w.length > 1)
    ) {
      // Only add if it looks technical (contains caps in original, numbers, dots, etc.)
      const original = `${words[i]} ${words[i + 1]}`;
      if (
        /[A-Z]/.test(original) ||
        /\d/.test(original) ||
        /[.+#]/.test(original)
      ) {
        found.add(bigram);
      }
    }
    if (triGram) {
      const triWords = triGram.split(" ");
      if (
        triWords.some((w) => !STOP_WORDS.has(w)) &&
        triWords.every((w) => w.length > 1)
      ) {
        const original = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (/[A-Z]/.test(original) || /\d/.test(original)) {
          found.add(triGram);
        }
      }
    }
  }

  // Extract single important words (not stop words, length > 2)
  for (const word of words) {
    const lower = word.toLowerCase().replace(/[.,;:!?()]/g, "");
    if (
      lower.length > 2 &&
      !STOP_WORDS.has(lower) &&
      /^[a-z0-9.+#-]+$/i.test(lower)
    ) {
      found.add(lower);
    }
  }

  return Array.from(found).sort();
}

function getResumeFullText(data: ResumeData): string {
  const parts: string[] = [
    data.summary,
    ...data.education.map((e) => `${e.university} ${e.degree} ${e.cgpa}`),
    ...data.projects.flatMap((p) => [p.title, p.techStack, ...p.bullets]),
    ...data.skills.map((s) => `${s.label} ${s.skills}`),
    ...data.achievements.map((a) => a.text),
  ];
  return parts.join(" ");
}

export function analyzeJD(jdText: string, resumeData: ResumeData): JDAnalysis {
  const jdKeywords = extractTechKeywords(jdText);
  const resumeText = getResumeFullText(resumeData).toLowerCase();

  const matched: string[] = [];
  const missing: string[] = [];

  for (const keyword of jdKeywords) {
    // Check if keyword exists in resume (with some flexibility)
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, "i");
    if (regex.test(resumeText)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  return {
    allKeywords: jdKeywords,
    matchedKeywords: matched,
    missingKeywords: missing,
    matchPercentage:
      jdKeywords.length > 0
        ? Math.round((matched.length / jdKeywords.length) * 100)
        : 0,
  };
}

export function suggestSkillAdditions(
  missingKeywords: string[],
  currentSkills: ResumeData["skills"],
): Map<string, string[]> {
  const suggestions = new Map<string, string[]>();

  // Categorize missing keywords into skill categories
  const categoryMap: Record<string, RegExp> = {
    "Languages & Core":
      /^(javascript|typescript|python|java|c\+\+|c#|go|golang|rust|ruby|php|swift|kotlin|scala|sql|nosql)$/i,
    "Frontend Development":
      /^(react|angular|vue|next|nuxt|svelte|html|css|sass|scss|tailwind|bootstrap|redux|webpack|vite|responsive|spa|pwa|ssr)$/i,
    "Backend Development":
      /^(node|express|fastify|nest|django|flask|spring|rest|restful|grpc|microservices|serverless|lambda|api|websocket|socket|real.time)$/i,
    "Database & Storage":
      /^(mongodb|postgresql|postgres|mysql|redis|elasticsearch|dynamodb|cassandra|firebase|supabase|pinecone|vector)$/i,
    "AI & Machine Learning":
      /^(machine learning|deep learning|ai|nlp|llm|gpt|openai|langchain|rag|embeddings|neural|tensorflow|pytorch)$/i,
    "Cloud & DevOps":
      /^(aws|azure|gcp|google cloud|docker|kubernetes|k8s|terraform|jenkins|ci\/cd|github actions|gitlab|vercel|netlify|heroku|linux|nginx)$/i,
    "Authentication & Security":
      /^(jwt|oauth|authentication|authorization|owasp|cors|security|encryption|ssl|tls)$/i,
    "Tools & Collaboration":
      /^(git|github|jira|agile|scrum|kanban|postman|swagger)$/i,
    "Architecture & Design":
      /^(design patterns|solid|oop|data structures|algorithms|system design|scalable|clean code)$/i,
  };

  for (const keyword of missingKeywords) {
    let categorized = false;
    for (const [category, pattern] of Object.entries(categoryMap)) {
      if (pattern.test(keyword)) {
        const existing = suggestions.get(category) || [];
        existing.push(keyword);
        suggestions.set(category, existing);
        categorized = true;
        break;
      }
    }
    if (!categorized) {
      const existing = suggestions.get("Other") || [];
      existing.push(keyword);
      suggestions.set("Other", existing);
    }
  }

  return suggestions;
}
