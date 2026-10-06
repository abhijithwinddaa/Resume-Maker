/**
 * Build the app deep link for a landing CTA. Existing query params (notably
 * utm_*) are kept untouched; mode/from/cta are set without duplicating keys.
 */
export function appUrl(
  cta: string,
  mode: string | undefined,
  search: string,
): string {
  const params = new URLSearchParams(search);
  params.delete("mode");
  params.delete("from");
  params.delete("cta");
  if (mode) params.set("mode", mode);
  params.set("from", "landing");
  params.set("cta", cta);
  return `/app/?${params.toString()}`;
}
