import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OptimizeReview } from "../components/OptimizeReview";
import type { ResumeChange } from "../utils/resumeDiff";

const changes: ResumeChange[] = [
  {
    id: "summary",
    section: "summary",
    location: "Summary",
    kind: "modified",
    before: "Frontend engineer.",
    after: "Frontend engineer building fast React apps.",
  },
  {
    id: "experience:0:bullet:0",
    section: "experience",
    location: "Engineer — Brightcart",
    kind: "modified",
    before: "Worked on checkout",
    after: "Built the React checkout flow",
  },
  {
    id: "experience:0:bullet:3",
    section: "experience",
    location: "Engineer — Brightcart",
    kind: "added",
    before: "",
    after: "Documented the release process",
  },
];

function setup() {
  const onApply = vi.fn();
  const onDiscard = vi.fn();
  render(<OptimizeReview changes={changes} onApply={onApply} onDiscard={onDiscard} />);
  return { onApply, onDiscard };
}

const applied = (onApply: ReturnType<typeof vi.fn>) =>
  [...(onApply.mock.calls[0][0] as Set<string>)].sort();

describe("OptimizeReview", () => {
  it("shows every change and starts with all of them kept", () => {
    setup();

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /apply 3 of 3/i })).toBeInTheDocument();
  });

  it("applies only the changes left as Keep", () => {
    const { onApply } = setup();

    const item = screen.getAllByRole("listitem")[1];
    fireEvent.click(within(item).getByRole("button", { name: /discard/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply 2 of 3/i }));

    expect(applied(onApply)).toEqual(["experience:0:bullet:3", "summary"]);
  });

  it("Discard all then Keep all toggles every change", () => {
    const { onApply } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Discard all" }));
    expect(screen.getByRole("button", { name: /apply 0 of 3/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    fireEvent.click(screen.getByRole("button", { name: /apply 3 of 3/i }));
    expect(applied(onApply)).toHaveLength(3);
  });

  it("can throw the whole rewrite away", () => {
    const { onApply, onDiscard } = setup();

    fireEvent.click(screen.getByRole("button", { name: /keep my original/i }));

    expect(onDiscard).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("reports each choice to assistive tech", () => {
    setup();
    const item = screen.getAllByRole("listitem")[0];

    const keep = within(item).getByRole("button", { name: /keep/i });
    expect(keep).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(item).getByRole("button", { name: /discard/i }));
    expect(keep).toHaveAttribute("aria-pressed", "false");
  });
});
