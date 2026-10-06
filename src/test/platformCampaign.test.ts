import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEvent = vi.fn();
vi.mock("../utils/analytics", () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));

import { recordCampaignAttribution } from "../utils/campaignAttribution";

function visit(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

describe("recordCampaignAttribution", () => {
  beforeEach(() => {
    trackEvent.mockClear();
    window.sessionStorage.clear();
  });

  it("ignores visits without utm_source and utm_campaign", () => {
    visit("?utm_source=x");
    recordCampaignAttribution("/");
    visit("?utm_campaign=y");
    recordCampaignAttribution("/");
    visit("");
    recordCampaignAttribution("/");
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("fires once per session using the legacy dedupe key", () => {
    visit("?utm_source=seo-landing&utm_medium=organic&utm_campaign=c&utm_content=primary-cta");
    recordCampaignAttribution("/app/");
    recordCampaignAttribution("/");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("landing_campaign_attribution", {
      utm_source: "seo-landing",
      utm_medium: "organic",
      utm_campaign: "c",
      utm_content: "primary-cta",
      entry_path: "/app/",
    });
    expect(window.sessionStorage.getItem("last_landing_campaign")).toBe(
      "seo-landing:c:primary-cta",
    );
  });

  it("fires again for a different campaign", () => {
    visit("?utm_source=a&utm_campaign=b");
    recordCampaignAttribution("/");
    visit("?utm_source=a&utm_campaign=z");
    recordCampaignAttribution("/");
    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent.mock.calls[0][1]).toMatchObject({ utm_medium: "", utm_content: "" });
  });
});
