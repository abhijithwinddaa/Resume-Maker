/**
 * Link hygiene for anything that ends up in an href or a DOCX hyperlink.
 * User-typed links are untrusted: "linkedin.com/in/me" must not become a
 * relative URL, and javascript:/data: must never become live links.
 */


// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f\\u200b-\\u200d\\u2060\\ufeff]", "g");
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Returns an absolute http(s) URL, or "" when the input is empty, a "#"
 * placeholder, uses any other scheme, or does not parse.
 */
export function safeUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let value = raw.replace(CONTROL_CHARS, "").trim();
  if (!value || value === "#") return "";

  const scheme = SCHEME.exec(value);
  if (scheme) {
    const rest = value.slice(scheme[0].length);
    // "localhost:3000/x" has a port, not a scheme.
    const looksLikePort = /^\d+(?:[/?#]|$)/.test(rest);
    if (!looksLikePort) {
      const name = scheme[1].toLowerCase();
      if (name !== "http" && name !== "https") return "";
      if (!rest.replace(/^\/+/, "")) return "";
      value = `${name}://${rest.replace(/^\/+/, "")}`;
    } else {
      value = `https://${value}`;
    }
  } else {
    value = `https://${value.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname) return "";
    return value;
  } catch {
    return "";
  }
}

/** Link text without the protocol, "www." and a bare trailing slash. */
export function displayUrl(raw: unknown): string {
  const url = safeUrl(raw);
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** `mailto:` link for an email address, or "" when it is not plausibly one. */
export function mailtoUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const clean = raw.replace(/[^A-Za-z0-9._%+\-@']/g, "");
  const at = clean.indexOf("@");
  if (at < 1 || at !== clean.lastIndexOf("@") || at === clean.length - 1) return "";
  return `mailto:${clean}`;
}

/** `tel:` link for a phone number, or "" when it has too few digits. */
export function telUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5) return "";
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
