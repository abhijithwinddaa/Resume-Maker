import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";

const printSpy = vi.fn();
const openSignInSpy = vi.fn();
const checkFeedbackSpy = vi.fn();
const exportToDocxSpy = vi.fn();
let mockUserId: string | null = "user_123";

vi.mock("react-to-print", () => ({
  useReactToPrint: () => printSpy,
}));

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ openSignIn: openSignInSpy }),
  useUser: () => ({
    user: mockUserId
      ? {
          id: mockUserId,
          emailAddresses: [{ id: "e1", emailAddress: "a@example.com" }],
          primaryEmailAddressId: "e1",
        }
      : null,
  }),
}));

vi.mock("../services/feedbackService", () => ({
  checkUserHasSubmittedFeedback: checkFeedbackSpy,
}));

vi.mock("../services/popularityService", () => ({
  recordFeatureUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../utils/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("../utils/docxExporter", () => ({ exportToDocx: exportToDocxSpy }));

// Imported after the mocks so the hook picks them up.
const { useExport } = await import("../hooks/useExport");
const { useAppStore } = await import("../store/appStore");

type ExportHook = ReturnType<typeof useExport>;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let root: Root | null = null;

/** Minimal stand-in for renderHook — @testing-library/dom isn't installed. */
async function renderExportHook(
  resumeRef: React.RefObject<HTMLDivElement | null>,
): Promise<{ current: ExportHook }> {
  const hookRef = { current: null as unknown as ExportHook };

  function Harness() {
    const value = useExport(resumeRef);
    // Published from an effect so the harness never writes during render.
    useEffect(() => {
      hookRef.current = value;
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Harness />);
  });

  return hookRef;
}

function buildResume(): ResumeData {
  const resume = createEmptyResume();
  resume.contact.name = "Abhijith Batturaj";
  resume.contact.email = "a@example.com";
  resume.showExperience = true;
  resume.experience = [
    {
      company: "Coding Club",
      role: "Full Stack Intern",
      location: "Remote",
      dateRange: "2024-2025",
      bullets: ["Built Socket.IO based chat module"],
    },
  ];
  resume.education = [
    {
      university: "Amity University",
      location: "Noida",
      degree: "MCA",
      yearRange: "2023-2025",
      cgpa: "8.5",
    },
  ];
  resume.projects = [
    {
      title: "Realtime chat",
      githubLink: "",
      liveLink: "",
      techStack: "React, Node",
      bullets: ["Improved UI flows and OpenAI quality checks"],
    },
  ];
  resume.skills = [{ label: "Languages", skills: "JavaScript, SQL" }];
  return resume;
}

/** A stand-in for the rendered A4 preview the PDF path measures. */
function buildPreviewRef(): React.RefObject<HTMLDivElement | null> {
  const node = document.createElement("div");
  Object.defineProperty(node, "scrollHeight", { value: 1000 });
  node.getBoundingClientRect = () => ({ width: 794, height: 1000 }) as DOMRect;
  document.body.appendChild(node);
  return { current: node };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mockUserId = "user_123";
  printSpy.mockClear();
  openSignInSpy.mockClear();
  exportToDocxSpy.mockClear().mockResolvedValue(undefined);
  checkFeedbackSpy
    .mockClear()
    .mockResolvedValue({ hasSubmitted: true, hadError: false });

  useAppStore.getState().setResumeData(buildResume());
  useAppStore.getState().setError(null);

  // jsdom has no rAF loop that settles on its own.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(async () => {
  if (root) {
    const toUnmount = root;
    await act(async () => toUnmount.unmount());
    root = null;
  }
  vi.unstubAllGlobals();
  useAppStore.getState().setResumeData(null);
  useAppStore.getState().setError(null);
  document.body.innerHTML = "";
});

describe("export buttons", () => {
  it("opens the print dialog when PDF export is requested", async () => {
    const hook = await renderExportHook(buildPreviewRef());

    await act(async () => {
      await hook.current.exportPDF();
    });

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().error).toBeNull();
  });

  it("writes a DOCX when DOCX export is requested", async () => {
    const hook = await renderExportHook(buildPreviewRef());

    await act(async () => {
      await hook.current.exportDocx();
    });

    expect(exportToDocxSpy).toHaveBeenCalledTimes(1);
    expect(exportToDocxSpy.mock.calls[0][0].contact.name).toBe(
      "Abhijith Batturaj",
    );
    expect(useAppStore.getState().error).toBeNull();
  });

  it("prompts sign-in instead of exporting when signed out", async () => {
    mockUserId = null;
    const hook = await renderExportHook(buildPreviewRef());

    await act(async () => {
      await hook.current.exportPDF();
    });

    expect(openSignInSpy).toHaveBeenCalledTimes(1);
    expect(printSpy).not.toHaveBeenCalled();
  });

  it("asks for feedback before the first export, then releases it", async () => {
    checkFeedbackSpy.mockResolvedValue({
      hasSubmitted: false,
      hadError: false,
    });
    const hook = await renderExportHook(buildPreviewRef());

    await act(async () => {
      await hook.current.exportPDF();
    });

    expect(hook.current.showFeedbackPanel).toBe(true);
    expect(hook.current.pendingExportFormat).toBe("pdf");
    expect(printSpy).not.toHaveBeenCalled();

    await act(async () => {
      hook.current.handleFeedbackCompleted();
    });

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error when the feedback status cannot be verified", async () => {
    checkFeedbackSpy.mockResolvedValue({ hasSubmitted: false, hadError: true });
    const hook = await renderExportHook(buildPreviewRef());

    await act(async () => {
      await hook.current.exportPDF();
    });

    expect(printSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().error).toMatch(/couldn't verify/i);
  });
});
