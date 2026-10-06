import { initAnalytics, trackEvent, trackPageView } from "../utils/analytics";
import { recordCampaignAttribution } from "../utils/campaignAttribution";
import { animateCount, initInteractions } from "./interactions";
import { appUrl } from "./ctaLinks";
import { loadLandingData } from "./data";
import type { LandingData, LandingReview } from "./types";

const STAT_KEYS = [
  "downloads",
  "atsScorings",
  "resumesCreated",
  "editSessions",
] as const;

const STAR_WORDS: Record<number, string> = {
  5: "five-star",
  4: "four-star",
  3: "three-star",
  2: "two-star",
  1: "one-star",
};

function all(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

function setText(root: ParentNode, selector: string, text: string): void {
  for (const el of all(root, selector)) el.textContent = text;
}

export function rewriteCtaLinks(root: Document, search: string): void {
  for (const a of all(root, "a[data-cta]")) {
    const cta = a.dataset.cta || "";
    a.setAttribute("href", appUrl(cta, a.dataset.mode, search));
  }
}

function hydrateStats(root: Document, data: LandingData): void {
  const section = root.querySelector<HTMLElement>("[data-stats-section]");
  if (!data.stats || !section) return;
  const stats = data.stats;
  for (const key of STAT_KEYS) {
    for (const el of all(root, `[data-stat="${key}"]`)) {
      const value = stats[key];
      // Re-hydration (cache then fresh) must not replay an unchanged count.
      if (el.dataset.value === String(value)) continue;
      el.dataset.value = String(value);
      animateCount(el, value);
    }
  }
  setText(root, "[data-downloads-users]", String(stats.downloadUsers));
  section.hidden = false;
}

function formatStars(rating: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildCard(
  template: HTMLTemplateElement,
  review: LandingReview,
): DocumentFragment {
  const card = template.content.cloneNode(true) as DocumentFragment;
  const stars = card.querySelector<HTMLElement>("[data-review-stars]");
  if (stars) {
    stars.textContent = formatStars(review.rating);
    stars.setAttribute("aria-label", `${review.rating} out of 5 stars`);
  }
  setText(card, "[data-review-comment]", review.comment);
  setText(card, "[data-review-date]", formatMonthYear(review.createdAt));
  const reply = card.querySelector<HTMLElement>("[data-review-reply]");
  if (reply) {
    if (review.reply) {
      setText(reply, "[data-review-reply-text]", review.reply);
      reply.hidden = false;
    } else {
      reply.hidden = true;
    }
  }
  return card;
}

function breakdownText(
  distribution: Record<number, number>,
): string {
  return [5, 4, 3, 2, 1]
    .filter((n) => distribution[n] > 0)
    .map((n) => `${distribution[n]} ${STAR_WORDS[n]}`)
    .join(", ");
}

function hydrateReviews(root: Document, data: LandingData): void {
  const { rating, reviews } = data;

  if (rating && rating.count > 0) {
    setText(root, "[data-rating-average]", rating.average.toFixed(1));
    setText(root, "[data-rating-count]", String(rating.count));
    setText(
      root,
      "[data-rating-breakdown]",
      breakdownText(rating.distribution),
    );
    for (const el of all(root, "[data-hide-until-rating]")) el.hidden = false;
  }

  const section = root.querySelector<HTMLElement>("[data-reviews-section]");
  if (!section) return;
  if (!rating && reviews.length === 0) return;

  const list = root.querySelector<HTMLElement>("[data-reviews-list]");
  const template = root.querySelector<HTMLTemplateElement>("#review-template");
  if (list && template) {
    list.replaceChildren(...reviews.map((r) => buildCard(template, r)));
  }
  section.hidden = false;
  // Nav links to #reviews stay hidden until there is something to scroll to.
  for (const el of all(root, "[data-reviews-link]")) el.hidden = false;
}

export function hydrateLanding(root: Document, data: LandingData | null): void {
  if (!data) return;
  hydrateStats(root, data);
  hydrateReviews(root, data);
}

function bindCtaTracking(root: Document): void {
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const a = target.closest<HTMLElement>("a[data-cta]");
    if (!a) return;
    trackEvent("landing_cta_click", {
      cta: a.dataset.cta || "",
      mode: a.dataset.mode || "",
    });
  });
}

export function boot(): void {
  initAnalytics();
  trackPageView("/");
  recordCampaignAttribution("/");
  initInteractions(document);
  rewriteCtaLinks(document, location.search);
  bindCtaTracking(document);
  void loadLandingData((data) => hydrateLanding(document, data));
}

boot();
