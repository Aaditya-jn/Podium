import type { TrendingCandidate } from "@/lib/trending/types";

const STOP_WORDS = new Set(
  "a an and are as at be by for from has have how in into is it its of on or that the their this to was were what when where which who why with about after before could would should new says say over under more most some than your our".split(" "),
);

export function filterFresh<T extends { publishedAt: string }>(items: T[], now = Date.now(), maxAgeDays = 14): T[] {
  const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const timestamp = Date.parse(item.publishedAt);
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now;
  });
}

export function wordsForSimilarity(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/&amp;/g, "and").match(/[a-z0-9]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  );
}

export function isNearDuplicate(left: string, right: string, threshold = 0.68): boolean {
  const leftWords = wordsForSimilarity(left);
  const rightWords = wordsForSimilarity(right);
  if (leftWords.size < 3 || rightWords.size < 3) return left.trim().toLowerCase() === right.trim().toLowerCase();
  let intersection = 0;
  for (const word of leftWords) if (rightWords.has(word)) intersection += 1;
  const similarity = intersection / Math.min(leftWords.size, rightWords.size);
  return similarity >= threshold;
}

export function dedupeBySimilarity<T>(items: T[], getText: (item: T) => string): T[] {
  const accepted: T[] = [];
  for (const item of items) {
    if (!accepted.some((existing) => isNearDuplicate(getText(existing), getText(item)))) accepted.push(item);
  }
  return accepted;
}

export function filterRecentTopics<T extends { topic: string }>(items: T[], recentTopics: string[]): T[] {
  return items.filter((item) => !recentTopics.some((recent) => isNearDuplicate(item.topic, recent)));
}

export function cleanCandidates(items: TrendingCandidate[], now = Date.now()): TrendingCandidate[] {
  const fresh = filterFresh(items, now).sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  return dedupeBySimilarity(fresh, (item) => item.title);
}
