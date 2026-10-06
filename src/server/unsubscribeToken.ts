import { createHmac, timingSafeEqual } from "node:crypto";
import { readEnv } from "./env.js";

function getSecret(): string {
  return readEnv("UNSUBSCRIBE_SECRET") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`unsubscribe:${userId}`)
    .digest("hex");
}

/** Returns "" when no secret is configured (no link should be sent then). */
export function createUnsubscribeToken(userId: string): string {
  const secret = getSecret();
  if (!secret || !userId) return "";
  return sign(userId, secret);
}

export function verifyUnsubscribeToken(
  userId: string,
  token: string,
): boolean {
  const secret = getSecret();
  if (!secret || !userId || !token) return false;

  const expected = Buffer.from(sign(userId, secret), "utf8");
  const provided = Buffer.from(token, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function buildUnsubscribeUrl(siteUrl: string, userId: string): string {
  const token = createUnsubscribeToken(userId);
  if (!token) return "";
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/api/notifications/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}
