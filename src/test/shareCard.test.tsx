import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const trackEventSpy = vi.hoisted(() => vi.fn());
vi.mock("../utils/analytics", () => ({ trackEvent: trackEventSpy }));

import { ShareCard } from "../components/ShareCard";

beforeEach(() => {
  localStorage.clear();
  trackEventSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "share");
});

describe("ShareCard", () => {
  it("offers each app as a link carrying that app's tag", () => {
    render(<ShareCard placement="menu" onClose={() => {}} />);

    const whatsapp = screen.getByRole("link", { name: /whatsapp/i });
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain("utm_source=whatsapp");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("link", { name: /linkedin/i })).toBeInTheDocument();
  });

  it("copies the tagged link and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareCard placement="menu" onClose={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("utm_source=copy"));
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("uses the device's share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ShareCard placement="after-export" onClose={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^share$/i }));
    });

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("utm_source=native") }),
    );
  });

  it("tells analytics where it was shown and what was used", () => {
    render(<ShareCard placement="after-export" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("link", { name: /telegram/i }));

    expect(trackEventSpy).toHaveBeenCalledWith("share_prompt_shown", { placement: "after-export" });
    expect(trackEventSpy).toHaveBeenCalledWith("share_clicked", {
      placement: "after-export",
      channel: "telegram",
    });
  });

  it("closing an automatic prompt counts as a no-thanks", () => {
    const onClose = vi.fn();
    render(<ShareCard placement="after-export" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("resume-maker:share-state")!).dismissedAt).toBeTypeOf(
      "number",
    );
  });

  it("closing a share the user opened themselves is not a dismissal", () => {
    render(<ShareCard placement="menu" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(localStorage.getItem("resume-maker:share-state")).toBeNull();
  });

  it("uses the user's own score jump in the message when given", () => {
    render(
      <ShareCard placement="after-improvement" improvement={{ from: 62, to: 81 }} onClose={() => {}} />,
    );

    const whatsapp = screen.getByRole("link", { name: /whatsapp/i });
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toMatch(/62.*81/);
  });
});
