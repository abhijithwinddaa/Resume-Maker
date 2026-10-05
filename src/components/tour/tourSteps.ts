/**
 * First-run guide content, one tour per screen.
 *
 * `targets` name `data-tour` attributes; the first one that is visible on
 * screen is highlighted. A step whose targets are all missing — the job
 * description box outside ATS mode, the desktop preview on a phone — is
 * skipped. A step without targets shows as a centered card.
 */

export type TourId = "landing" | "input" | "editor" | "score";

export interface TourStep {
  id: string;
  targets?: string[];
  title: string;
  body: string;
  /** Centered steps can show the animated "how it works" illustration. */
  illustration?: "flow";
}

export const TOURS: Record<TourId, TourStep[]> = {
  landing: [
    {
      id: "welcome",
      title: "Welcome! Here's how it works",
      body: "Bring your resume in, improve it with AI, and download a clean, ATS-friendly PDF or Word file. This quick tour shows you around.",
      illustration: "flow",
    },
    {
      id: "mode-ats",
      targets: ["mode-ats"],
      title: "Applying for a specific job?",
      body: "Add your resume and the job posting. You'll get a match score, the keywords you're missing, and help closing the gaps.",
    },
    {
      id: "mode-edit",
      targets: ["mode-edit"],
      title: "Already have a resume?",
      body: "Upload your PDF or paste the text. AI turns it into an editable form with a live preview.",
    },
    {
      id: "mode-create",
      targets: ["mode-create"],
      title: "Starting from scratch?",
      body: "Fill in a guided form one section at a time. Your resume builds itself as you type.",
    },
    {
      id: "help",
      targets: ["help"],
      title: "Need this again?",
      body: "Click ? anytime to replay the guide for the screen you're on.",
    },
  ],
  input: [
    {
      id: "upload",
      targets: ["upload-pdf", "upload-pdf-button"],
      title: "Upload your resume",
      body: "Choose a PDF. Even scanned resumes work, and your links are kept.",
    },
    {
      id: "paste",
      targets: ["resume-text"],
      title: "…or paste the text",
      body: "Pasting works too. Make sure your name is at the top so it gets picked up.",
    },
    {
      id: "job",
      targets: ["job-description"],
      title: "Add the job posting",
      body: "Paste the full job description. More detail means a more accurate keyword match.",
    },
    {
      id: "go",
      targets: ["primary-action"],
      title: "Let AI read it",
      body: "This turns your resume into editable sections, and scores it against the job if you added one. It usually takes a few seconds.",
    },
  ],
  editor: [
    {
      id: "tabs",
      targets: ["editor-tabs"],
      title: "Edit one section at a time",
      body: "Switch between Contact, Experience, Skills and the rest. Drag items to reorder them.",
    },
    {
      id: "preview",
      targets: ["live-preview", "mobile-preview"],
      title: "See it live",
      body: "Every change shows up in the preview right away. It's exactly what you'll download.",
    },
    {
      id: "templates",
      targets: ["templates"],
      title: "Change the look",
      body: "Pick a template, colors and fonts. Your content stays the same.",
    },
    {
      id: "score",
      targets: ["self-score"],
      title: "Check your score",
      body: "Get an ATS score and improvement tips, even without a job description.",
    },
    {
      id: "saved",
      targets: ["save-status", "files"],
      title: "Saved as you go",
      body: "Your changes save automatically. All your resumes live under Files.",
    },
    {
      id: "export",
      targets: ["export"],
      title: "Download when you're ready",
      body: "Export a print-ready PDF that fits the page, or a Word file.",
    },
  ],
  score: [
    {
      id: "meter",
      targets: ["score-meter"],
      title: "Your ATS score",
      body: "How well your resume matches, out of 100. The breakdown shows where points were lost.",
    },
    {
      id: "keywords",
      targets: ["missing-keywords"],
      title: "What's missing",
      body: "Keywords from the job your resume doesn't mention yet. Only add the ones you've genuinely worked with.",
    },
    {
      id: "optimize",
      targets: ["optimize"],
      title: "Improve it with AI",
      body: "AI rewrites your bullets to bring out what you've already done. It won't invent experience or numbers.",
    },
    {
      id: "edit",
      targets: ["go-editor"],
      title: "Review it yourself",
      body: "Open the editor to check every change before you download.",
    },
  ],
};

const SEEN_KEY = "resume-maker:tours-seen";

function readSeen(): Partial<Record<TourId, boolean>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function hasSeenTour(id: TourId): boolean {
  return readSeen()[id] === true;
}

export function markTourSeen(id: TourId): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [id]: true }));
  } catch {
    // Storage blocked (private mode): the guide may show again next visit.
  }
}

/** The step's first target element that is actually rendered and visible. */
export function findTourTarget(step: TourStep): HTMLElement | null {
  for (const name of step.targets ?? []) {
    const candidates = document.querySelectorAll<HTMLElement>(
      `[data-tour="${name}"]`,
    );
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return el;
    }
  }
  return null;
}

/** Steps that can be shown right now: centered ones, or ones with a target. */
export function resolveTourSteps(id: TourId): TourStep[] {
  return TOURS[id].filter(
    (step) => !step.targets || findTourTarget(step) !== null,
  );
}
