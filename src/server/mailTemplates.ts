import { normalizeSiteUrl } from "./env.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildGreeting(firstName?: string): string {
  const cleaned = firstName?.trim();
  return cleaned ? `hey ${cleaned}` : "hey there";
}

function buildBaseHtml(params: {
  eyebrow: string;
  title: string;
  intro: string;
  ctaLabel: string;
  siteUrl: string;
  body?: string;
}) {
  const siteUrl = normalizeSiteUrl(params.siteUrl);
  return [
    "<!doctype html>",
    "<html>",
    "<body style=\"margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">",
    "<div style=\"max-width:560px;margin:0 auto;padding:24px;\">",
    "<div style=\"background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);border-radius:20px;padding:28px;color:#fff;\">",
    `<p style="margin:0 0 12px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;">${escapeHtml(params.eyebrow)}</p>`,
    `<h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;">${escapeHtml(params.title)}</h1>`,
    `<p style="margin:0;font-size:15px;line-height:1.7;opacity:0.95;">${escapeHtml(params.intro)}</p>`,
    params.body
      ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.7;opacity:0.92;">${escapeHtml(params.body)}</p>`
      : "",
    `<div style="margin-top:24px;"><a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#f8fafc;color:#0f172a;text-decoration:none;font-weight:700;">${escapeHtml(params.ctaLabel)}</a></div>`,
    "</div>",
    `<p style="margin:14px 6px 0;font-size:12px;line-height:1.6;color:#64748b;">Resume Maker • ${escapeHtml(siteUrl)}</p>`,
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

export function buildWelcomeEmail(params: {
  firstName?: string;
  siteUrl: string;
}) {
  const greeting = buildGreeting(params.firstName);
  const subject = "you’re in. let’s make that resume slap";
  const intro = `${greeting}, your resume glow-up starts here. tweak a few lines, check the ATS score, and ship something you feel good about.`;
  const body = "tiny edits today, big interview energy tomorrow.";

  return {
    subject,
    text: `${greeting}, your resume glow-up starts here. tweak a few lines, check the ATS score, and ship something you feel good about.\n\nOpen Resume Maker: ${normalizeSiteUrl(params.siteUrl)}`,
    html: buildBaseHtml({
      eyebrow: "first login",
      title: "Resume time, but make it easy.",
      intro,
      body,
      ctaLabel: "Open Resume Maker",
      siteUrl: params.siteUrl,
    }),
  };
}

export function buildReminderEmail(params: {
  firstName?: string;
  siteUrl: string;
  audienceMode: "all" | "recent-active";
}) {
  const greeting = buildGreeting(params.firstName);
  const subject = "tiny resume check? big win energy";
  const body =
    params.audienceMode === "all"
      ? "quick nudge: hop back in, clean one section, and keep the momentum going."
      : "you were active recently, so here’s your little keep-going reminder.";

  return {
    subject,
    text: `${greeting}, ${body}\n\nJump back into Resume Maker: ${normalizeSiteUrl(params.siteUrl)}`,
    html: buildBaseHtml({
      eyebrow: "daily reminder",
      title: "One small update can move the whole resume.",
      intro: `${greeting}, ${body}`,
      ctaLabel: "Jump back in",
      siteUrl: params.siteUrl,
    }),
  };
}

export function buildFeedbackReplyEmail(params: {
  firstName?: string;
  siteUrl: string;
  reply: string;
}) {
  const greeting = buildGreeting(params.firstName);
  const subject = "your Resume Maker comment got a reply";

  return {
    subject,
    text: `${greeting}, we replied to your feedback on Resume Maker.\n\nReply: ${params.reply.trim()}\n\nOpen Resume Maker: ${normalizeSiteUrl(params.siteUrl)}`,
    html: buildBaseHtml({
      eyebrow: "feedback reply",
      title: "You’ve got a reply from Resume Maker.",
      intro: `${greeting}, we replied to your feedback on Resume Maker.`,
      body: `Reply: ${params.reply.trim()}`,
      ctaLabel: "See it on Resume Maker",
      siteUrl: params.siteUrl,
    }),
  };
}
