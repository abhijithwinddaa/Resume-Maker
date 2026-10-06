import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock("../utils/aiService", () => ({ postServerAIRequest: postMock }));

import ResumeEditor from "../components/ResumeEditor";
import { useAppStore } from "../store/appStore";
import { createEmptyResume, type ResumeData } from "../types/resume";

const A = "Worked on the checkout page for the store";
const B = "Handled customer tickets for the support team";

function seed(): ResumeData {
  const r = createEmptyResume();
  r.contact.name = "Asha Rao";
  r.experience = [
    { id: "exp-1", company: "Acme", role: "Developer", location: "", dateRange: "", bullets: [A, B] },
  ];
  return r;
}

function Harness() {
  const data = useAppStore((s) => s.resumeData)!;
  return <ResumeEditor data={data} onChange={(d) => useAppStore.getState().setResumeData(d)} />;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const bullets = () => (useAppStore.getState().resumeData as ResumeData).experience[0].bullets;

describe("AI bullet results arriving late", () => {
  beforeEach(() => {
    postMock.mockReset();
    useAppStore.getState().setResumeData(seed(), false);
    useAppStore.getState().setActiveSection("experience");
  });

  it("keeps edits made elsewhere while the request was running", async () => {
    const pending = deferred<{ optimizedText: string }>();
    postMock.mockReturnValue(pending.promise);
    render(<Harness />);

    fireEvent.click(screen.getAllByTitle("Enhance bullet point with AI")[0]);
    // The user keeps typing in another field while the AI works.
    fireEvent.change(screen.getByDisplayValue("Developer"), { target: { value: "Senior Developer" } });

    await act(async () => pending.resolve({ optimizedText: "Rebuilt the checkout page, cutting load time" }));

    const exp = (useAppStore.getState().resumeData as ResumeData).experience[0];
    expect(exp.role).toBe("Senior Developer");
    expect(exp.bullets[0]).toBe("Rebuilt the checkout page, cutting load time");
    expect(exp.bullets[1]).toBe(B);
  });

  it("does not apply when the bullet text changed, and says so", async () => {
    const pending = deferred<{ optimizedText: string }>();
    postMock.mockReturnValue(pending.promise);
    render(<Harness />);

    fireEvent.click(screen.getAllByTitle("Enhance bullet point with AI")[0]);
    act(() => {
      const latest = useAppStore.getState().resumeData as ResumeData;
      const exp = { ...latest.experience[0], bullets: ["Totally different text now", B] };
      useAppStore.getState().setResumeData({ ...latest, experience: [exp] });
    });
    await act(async () => pending.resolve({ optimizedText: "AI text" }));

    expect(bullets()).toEqual(["Totally different text now", B]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/changed while the AI was working/i);
  });

  it("lands on the right bullet when bullets above were removed", async () => {
    const pending = deferred<{ optimizedText: string }>();
    postMock.mockReturnValue(pending.promise);
    render(<Harness />);

    fireEvent.click(screen.getAllByTitle("Enhance bullet point with AI")[1]);
    act(() => {
      const latest = useAppStore.getState().resumeData as ResumeData;
      const exp = { ...latest.experience[0], bullets: [B] };
      useAppStore.getState().setResumeData({ ...latest, experience: [exp] });
    });
    await act(async () => pending.resolve({ optimizedText: "Resolved 200 support tickets a week" }));

    expect(bullets()).toEqual(["Resolved 200 support tickets a week"]);
  });

  it("shows request errors inline instead of an alert", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    postMock.mockRejectedValue(new Error("Please sign in to continue."));
    render(<Harness />);

    fireEvent.click(screen.getAllByTitle("Enhance bullet point with AI")[0]);
    expect(await screen.findByText("Please sign in to continue.")).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe("assigning missing ids", () => {
  it("does not add an undo entry or clear redo", () => {
    const data = seed();
    data.experience[0] = { ...data.experience[0], id: undefined };
    useAppStore.getState().setResumeData(data, false);
    useAppStore.setState({ history: { past: [], future: [seed()] } });
    useAppStore.getState().setActiveSection("experience");

    render(<Harness />);

    const state = useAppStore.getState();
    expect(state.resumeData?.experience[0].id).toBeTruthy();
    expect(state.history.past).toHaveLength(0);
    expect(state.history.future).toHaveLength(1);
  });
});
