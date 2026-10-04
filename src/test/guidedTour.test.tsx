import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GuidedTour } from "../components/tour/GuidedTour";
import { hasSeenTour, markTourSeen } from "../components/tour/tourSteps";

/** Puts tour anchors on the page; jsdom reports zero size for everything else. */
function renderAnchors(names: string[]) {
  return render(
    <div>
      {names.map((name) => (
        <button key={name} data-tour={name}>
          {name}
        </button>
      ))}
    </div>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const visible = this.hasAttribute("data-tour");
      return {
        top: 100,
        left: 100,
        width: visible ? 120 : 0,
        height: visible ? 40 : 0,
        right: 220,
        bottom: 140,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GuidedTour", () => {
  it("only walks through steps whose element is on screen", () => {
    // The input tour has 4 steps; the job description box is absent (Edit mode).
    renderAnchors(["upload-pdf", "resume-text", "primary-action"]);
    render(<GuidedTour tourId="input" onClose={() => {}} />);

    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Upload your resume");
  });

  it("moves forward and back, then finishes and remembers it was seen", () => {
    renderAnchors(["upload-pdf", "resume-text"]);
    const onClose = vi.fn();
    render(<GuidedTour tourId="input" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasSeenTour("input")).toBe(true);
  });

  it("closes on Escape and counts that as seen", () => {
    renderAnchors(["upload-pdf"]);
    const onClose = vi.fn();
    render(<GuidedTour tourId="input" onClose={onClose} />);

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(onClose).toHaveBeenCalled();
    expect(hasSeenTour("input")).toBe(true);
  });

  it("supports the arrow keys", () => {
    renderAnchors(["upload-pdf", "resume-text"]);
    render(<GuidedTour tourId="input" onClose={() => {}} />);

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    });
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("puts focus on the Next button so keyboard users can continue", () => {
    renderAnchors(["upload-pdf", "resume-text"]);
    render(<GuidedTour tourId="input" onClose={() => {}} />);

    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  });

  it("shows the welcome step centered even with nothing to point at", () => {
    render(<GuidedTour tourId="landing" onClose={() => {}} />);

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Welcome! Here's how it works",
    );
  });

  it("closes quietly when the screen has nothing to point at", () => {
    const onClose = vi.fn();
    render(<GuidedTour tourId="score" onClose={onClose} />);

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("tour seen state", () => {
  beforeEach(() => localStorage.clear());

  it("is per screen", () => {
    markTourSeen("landing");

    expect(hasSeenTour("landing")).toBe(true);
    expect(hasSeenTour("editor")).toBe(false);
  });

  it("treats corrupt storage as not seen", () => {
    localStorage.setItem("resume-maker:tours-seen", "{oops");

    expect(hasSeenTour("landing")).toBe(false);
  });
});
