const ADMIN_EMAILS = new Set([
  "abhijithyadav786@gmail.com",
  "abhijithwinddaa@gmail.com",
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}
