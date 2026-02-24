import type { ResumeData } from "../types/resume";
import { DEFAULT_SECTION_ORDER } from "../types/resume";

export const defaultResumeData: ResumeData = {
  contact: {
    name: "Abhijith Batturaj",
    phone: "+91 8374831357",
    email: "abhijithyadav786@gmail.com",
    linkedin: "https://www.linkedin.com/in/batturaj-abhijith/",
    github: "https://github.com/abhijithwinddaa",
    portfolio: "https://www.abhijithwinddaa.tech/",
  },
  summary:
    "Full-Stack Software Engineer building scalable, production-grade applications with JavaScript (React.js) and Node.js. Expertise in system design, RESTful APIs, microservices, and performance optimization. Experienced in real-time and distributed systems with end-to-end ownership from development to deployment. Active open-source contributor delivering reliable, high-impact solutions.",
  education: [
    {
      university: "Amity University, Bengaluru",
      location: "Bengaluru",
      degree: "Master of Computer Applications",
      yearRange: "2023 - 2025",
      cgpa: "8.5 CGPA",
    },
  ],
  projects: [
    {
      title: "Chatify - Real-Time Chat Application",
      githubLink: "https://github.com/abhijithwinddaa/chatify",
      liveLink: "https://chatify.abhijithwinddaa.tech/",
      techStack: "React.js, Node.js, Express.js, Socket.IO, MongoDB",
      bullets: [
        "Architected production-ready real-time chat platform using MERN stack with Socket.IO, implementing microservices architecture (Frontend + Backend + AI service) achieving <50ms message delivery latency across 100+ concurrent WebSocket connections.",
        "Engineered AI-powered semantic search using RAG (Retrieval Augmented Generation) pipeline with Azure OpenAI embeddings, Pinecone vector database, and Groq LLM, reducing chat history search time by 94% (15s → 800ms).",
        "Resolved critical cross-browser authentication issues affecting Safari/mobile users (30% of traffic) by implementing SameSite cookie policies and CORS configuration, achieving 99% cross-platform compatibility.",
        "Deployed multi-service application on Vercel and Render with automated CI/CD workflows, environment-based configuration, and zero-downtime deployments.",
      ],
    },
    {
      title: "JobbyApp - Job Discovery Platform with Advanced Filtering",
      githubLink: "https://github.com/abhijithwinddaa/jobbyApp",
      liveLink: "https://jobbywinddaa.ccbp.tech/login",
      techStack: "React.js, Node.js, JWT, REST APIs",
      bullets: [
        "Designed React-based job search platform with advanced filtering system, managing complex application state across 7+ concurrent variables using state lifting to prevent race conditions in API request sequencing.",
        "Architected reusable component library (JobCard, ProfileDetails, FilterControls) with consistent prop interfaces and isolated error boundaries, reducing component variants by 40% and improving code maintainability.",
        "Implemented secure authentication system with JWT lifecycle management, automatic session expiry handling, and HttpOnly cookie-based storage following OWASP security standards.",
        "Established quality assurance pipeline including ESLint configuration, build validation, and production monitoring ensuring 99% uptime.",
      ],
    },
  ],
  skills: [
    { label: "Languages & Core", skills: "JavaScript (ES6+), Python, SQL" },
    {
      label: "Frontend Development",
      skills: "React.js, HTML5, CSS3, Vite, Responsive Design",
    },
    {
      label: "Backend Development",
      skills:
        "Node.js, Express.js, RESTful APIs, WebSocket (Socket.IO), Microservices Architecture",
    },
    {
      label: "Database & Storage",
      skills: "MongoDB, PostgreSQL, Pinecone (Vector DB), Supabase",
    },
    {
      label: "AI & Machine Learning",
      skills: "RAG, Azure OpenAI, Groq LLM, Embeddings, LangChain",
    },
    {
      label: "Cloud & DevOps",
      skills: "Vercel, Render, CI/CD, Environment Configuration",
    },
    {
      label: "Authentication & Security",
      skills: "JWT, OAuth 2.0, OWASP Best Practices, CORS, Cookie Policies",
    },
    { label: "Tools & Collaboration", skills: "Git, GitHub, Postman, VS Code" },
    {
      label: "Architecture & Design",
      skills:
        "System Design, Microservices, OOPS, Data Structures & Algorithms, Clean Code Principles",
    },
  ],
  achievements: [
    {
      text: "Universal-App-Opener (Deep Link Library) — Built Zoom and Substack deep link handlers for iOS/Android with password handling; fixed CSS layout issues. 3 PRs merged.",
      githubLink:
        "https://github.com/mdsaban/universal-app-opener/pulls?q=author:abhijithwinddaa",
    },
    {
      text: "Excalidraw (97k+ stars) — Contributed grid style feature, keyboard shortcut fixes, and hex color validation with a11y support. 4 PRs open/in review.",
      githubLink:
        "https://github.com/excalidraw/excalidraw/pulls?q=author:abhijithwinddaa",
    },
    {
      text: "ZIO-Blocks (Scala/ZIO) — Implemented MessagePack binary codec with cross-platform support (JVM/JS/Native). 2 PRs open/in review.",
      githubLink:
        "https://github.com/zio/zio-blocks/pulls?q=author:abhijithwinddaa",
    },
  ],
  certificates: [],
  showCertificates: false,
  experience: [],
  showExperience: false,
  sectionOrder: DEFAULT_SECTION_ORDER,
};
