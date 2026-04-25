import type { JWTPayload } from "jose";

function readStringClaim(payload: JWTPayload, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function getUserEmailFromPayload(payload: JWTPayload): string {
  const direct = readStringClaim(
    payload,
    "email",
    "email_address",
    "primary_email_address",
    "https://clerk.dev/email",
  );
  if (direct) return direct.toLowerCase();

  const emailAddresses = payload.email_addresses;
  if (Array.isArray(emailAddresses)) {
    for (const item of emailAddresses) {
      if (!item || typeof item !== "object") continue;
      const email = (item as { email_address?: unknown }).email_address;
      if (typeof email === "string" && email.trim()) {
        return email.trim().toLowerCase();
      }
    }
  }

  return "";
}

export function getUserFirstNameFromPayload(payload: JWTPayload): string {
  return readStringClaim(payload, "given_name", "first_name", "name");
}
