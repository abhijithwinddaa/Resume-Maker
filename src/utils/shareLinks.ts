/**
 * Links for sharing Resume Maker. Every link carries UTM tags, which the app
 * already records on arrival (landing_campaign_attribution), so shares show up
 * per channel in analytics.
 */

const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://resume.batturaj.in").replace(
  /\/+$/,
  "",
);

export type ShareChannel = "whatsapp" | "linkedin" | "telegram" | "x";

export const SHARE_CHANNELS: ShareChannel[] = ["whatsapp", "linkedin", "telegram", "x"];

export interface ShareTarget {
  id: ShareChannel;
  label: string;
  href: string;
}

export function buildShareUrl(source: ShareChannel | "copy" | "native"): string {
  const url = new URL(`${SITE_URL}/`);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "user_share");
  return url.toString();
}

/** The words that go with the link; personal when the user has a win to show. */
export function shareMessage(improvement?: { from: number; to: number }): string {
  if (improvement && improvement.to > improvement.from) {
    return `I raised my resume's ATS score from ${improvement.from} to ${improvement.to} with Resume Maker. It's free: check your resume against any job description and fix it before you apply.`;
  }
  return "Free AI resume checker: see your ATS score against any job description, fix what's missing, and download a clean PDF. Worth a look before your next application.";
}

export function buildShareTargets(message: string): ShareTarget[] {
  const enc = encodeURIComponent;
  const link = (channel: ShareChannel) => buildShareUrl(channel);

  return [
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${enc(`${message} ${link("whatsapp")}`)}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      // LinkedIn reads only the URL; the page's own preview supplies the text.
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(link("linkedin"))}`,
    },
    {
      id: "telegram",
      label: "Telegram",
      href: `https://t.me/share/url?url=${enc(link("telegram"))}&text=${enc(message)}`,
    },
    {
      id: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${enc(message)}&url=${enc(link("x"))}`,
    },
  ];
}
