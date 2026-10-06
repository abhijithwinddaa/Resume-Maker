import { beforeEach, describe, expect, it } from "vitest";
import {
  SHARE_CHANNELS,
  buildShareUrl,
  buildShareTargets,
  shareMessage,
} from "../utils/shareLinks";
import {
  recordShareDismissed,
  recordShared,
  shouldAutoPromptShare,
} from "../utils/sharePrompt";

const DAY = 24 * 60 * 60 * 1000;

describe("buildShareUrl", () => {
  it("tags the link so analytics can attribute the visit", () => {
    const url = new URL(buildShareUrl("whatsapp"));

    expect(url.searchParams.get("utm_source")).toBe("whatsapp");
    expect(url.searchParams.get("utm_campaign")).toBe("user_share");
    expect(url.searchParams.get("utm_medium")).toBe("social");
  });
});

describe("buildShareTargets", () => {
  const targets = buildShareTargets(shareMessage());

  it("offers each sharing app with an https link", () => {
    expect(targets.map((t) => t.id)).toEqual(SHARE_CHANNELS);
    for (const target of targets) expect(target.href.startsWith("https://")).toBe(true);
  });

  it("puts the channel's own tagged link inside each share", () => {
    for (const target of targets) {
      const decoded = decodeURIComponent(target.href);
      expect(decoded).toContain(`utm_source=${target.id}`);
    }
  });

  it("includes the message where the app supports text", () => {
    const whatsapp = targets.find((t) => t.id === "whatsapp")!;
    expect(decodeURIComponent(whatsapp.href)).toContain("ATS");
  });
});

describe("shareMessage", () => {
  it("mentions the user's own score jump when there is one", () => {
    expect(shareMessage({ from: 62, to: 81 })).toMatch(/62.*81/);
  });

  it("has a general message otherwise", () => {
    expect(shareMessage()).toMatch(/free/i);
  });
});

describe("shouldAutoPromptShare", () => {
  beforeEach(() => localStorage.clear());

  it("prompts someone who has never dismissed or shared", () => {
    expect(shouldAutoPromptShare(Date.now())).toBe(true);
  });

  it("stays quiet for 30 days after a dismissal", () => {
    const now = Date.now();
    recordShareDismissed(now - 10 * DAY);
    expect(shouldAutoPromptShare(now)).toBe(false);

    recordShareDismissed(now - 31 * DAY);
    expect(shouldAutoPromptShare(now)).toBe(true);
  });

  it("stays quiet for 90 days after the user shared", () => {
    const now = Date.now();
    recordShared(now - 60 * DAY);
    expect(shouldAutoPromptShare(now)).toBe(false);

    recordShared(now - 91 * DAY);
    expect(shouldAutoPromptShare(now)).toBe(true);
  });

  it("does not prompt when storage is unreadable, so it can't nag every visit", () => {
    localStorage.setItem("resume-maker:share-state", "{broken");
    expect(shouldAutoPromptShare(Date.now())).toBe(false);
  });
});
