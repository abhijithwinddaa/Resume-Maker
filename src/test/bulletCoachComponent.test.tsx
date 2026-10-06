import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock("../utils/aiService", () => ({ postServerAIRequest: postMock }));

import BulletCoach from "../components/BulletCoach";

const WEAK = "Rebuilt the checkout page in React";

describe("BulletCoach", () => {
  beforeEach(() => postMock.mockReset());

  it("stays quiet until there is a bullet to judge", () => {
    const { container } = render(<BulletCoach text="Built a" roleFamily="engineering" onApply={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the three checks and the first tip", () => {
    render(<BulletCoach text="Worked on the checkout page" roleFamily="engineering" onApply={vi.fn()} />);
    expect(screen.getByText(/Action verb/)).toHaveClass("coach-chip--fail");
    expect(screen.getByText(/What & how/)).toHaveClass("coach-chip--fail");
    expect(screen.getByText("Result")).toHaveClass("coach-chip--fail");
    expect(screen.getByText(/Swap "Worked on"/, { selector: ".coach-tip" })).toBeInTheDocument();
  });

  it("hides 'Add a result' when the bullet already has a number", () => {
    render(
      <BulletCoach text="Built a React checkout used by 30k shoppers" roleFamily="engineering" onApply={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /add a result/i })).not.toBeInTheDocument();
  });

  it("rewrites the bullet with the user's own number", async () => {
    postMock.mockResolvedValue({ optimizedText: "Rebuilt the checkout page in React, making it ~40% faster" });
    const onApply = vi.fn();
    render(<BulletCoach text={WEAK} roleFamily="engineering" onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: /add a result/i }));
    fireEvent.click(screen.getByRole("button", { name: "Made it faster" }));
    fireEvent.change(screen.getByLabelText("How much faster?"), { target: { value: "~40%" } });
    fireEvent.click(screen.getByRole("button", { name: /rewrite my bullet/i }));

    expect(postMock).toHaveBeenCalledWith("/api/optimize/bullet", {
      bulletText: WEAK,
      jobDescription: undefined,
      facts: { changeType: "faster", amount: "~40%", detail: undefined },
    });
    await screen.findByText("Rebuilt the checkout page in React, making it ~40% faster");
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(onApply).toHaveBeenCalledWith("Rebuilt the checkout page in React, making it ~40% faster");
  });

  it("inserts a blank when the user isn't sure yet", () => {
    const onApply = vi.fn();
    render(<BulletCoach text={WEAK} roleFamily="engineering" onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /add a result/i }));
    fireEvent.click(screen.getByRole("button", { name: "Made it faster" }));
    fireEvent.click(screen.getByRole("button", { name: /add a blank/i }));
    expect(onApply).toHaveBeenCalledWith("Rebuilt the checkout page in React, making it [X%] faster");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("reminds the user to fill a blank", () => {
    render(<BulletCoach text={`${WEAK}, making it [X%] faster`} roleFamily="engineering" onApply={vi.fn()} />);
    expect(screen.getByText(/can.t download until it.s filled in/i)).toBeInTheDocument();
  });

  it("shows the error and lets the user retry", async () => {
    postMock.mockRejectedValueOnce(new Error("Please sign in to continue."));
    render(<BulletCoach text={WEAK} roleFamily="engineering" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add a result/i }));
    fireEvent.click(screen.getByRole("button", { name: "Made it faster" }));
    fireEvent.change(screen.getByLabelText("How much faster?"), { target: { value: "2x" } });
    fireEvent.click(screen.getByRole("button", { name: /rewrite my bullet/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please sign in to continue.");

    postMock.mockResolvedValueOnce({ optimizedText: "ok" });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));
  });
});

describe("AI notice", () => {
  it("reminds the user to double-check the AI's rewrite", async () => {
    postMock.mockResolvedValue({ optimizedText: "Rebuilt checkout, making it ~40% faster" });
    render(<BulletCoach text={WEAK} roleFamily="engineering" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add a result/i }));
    fireEvent.click(screen.getByRole("button", { name: "Made it faster" }));
    fireEvent.change(screen.getByLabelText("How much faster?"), { target: { value: "~40%" } });
    fireEvent.click(screen.getByRole("button", { name: /rewrite my bullet/i }));
    expect(await screen.findByText(/AI can make mistakes/)).toBeInTheDocument();
  });
});
