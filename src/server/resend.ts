import { normalizeSiteUrl, readEnv } from "./env.js";

interface ResendTag {
  name: string;
  value: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
  replyTo?: string;
  tags?: ResendTag[];
}

interface ResendSuccessResponse {
  id: string;
}

interface ResendErrorResponse {
  message?: string;
  name?: string;
}

const RESEND_API_URL = "https://api.resend.com/emails";

function getMailConfig() {
  const apiKey = readEnv("RESEND_API_KEY");
  const from = readEnv(
    "RESEND_FROM_EMAIL",
    "RESEND_FROM",
    "RESEND_SENDER_EMAIL",
  );
  const replyTo = readEnv("RESEND_REPLY_TO_EMAIL", "RESEND_REPLY_TO");

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }

  if (!from) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL environment variable. Set a sender address before sending mail.",
    );
  }

  return {
    apiKey,
    from,
    replyTo,
  };
}

export function getMailSiteUrl(): string {
  const siteUrl = readEnv("SITE_URL", "VITE_SITE_URL");
  return normalizeSiteUrl(siteUrl || "https://resume.batturaj.in");
}

export async function sendTransactionalEmail(params: SendEmailParams) {
  const config = getMailConfig();

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(params.idempotencyKey
        ? { "Idempotency-Key": params.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      from: config.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: params.replyTo || config.replyTo || undefined,
      tags: params.tags,
    }),
  });

  const rawBody = await response.text();
  let parsedBody: ResendSuccessResponse | ResendErrorResponse | null = null;
  if (rawBody.trim()) {
    try {
      parsedBody = JSON.parse(rawBody) as
        | ResendSuccessResponse
        | ResendErrorResponse;
    } catch {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    const message =
      (parsedBody as ResendErrorResponse | null)?.message ||
      rawBody.trim() ||
      `Resend request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const emailId = (parsedBody as ResendSuccessResponse | null)?.id;
  if (!emailId) {
    throw new Error("Resend did not return an email id.");
  }

  return {
    id: emailId,
  };
}
