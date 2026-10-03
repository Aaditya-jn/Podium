import "server-only";

import { getCategory } from "@/lib/config/categories";
import { fetchFromSearch } from "@/lib/trending/adapters";
import { cleanCandidates, dedupeBySimilarity } from "@/lib/trending/filters";
import { generateTopicsWithGemini } from "@/lib/trending/gemini";
import { isSafeTopic } from "@/lib/trending/safety";
import { trendingQueriesByCategory } from "@/lib/trending/queries";
import type { TrendingCandidate, TrendingTopic } from "@/lib/trending/types";

const CACHE_MS = 90 * 60 * 1000;
type CacheEntry = { expiresAt: number; pending: Promise<TrendingTopic[]> };
const topicCache = new Map<string, CacheEntry>();

function sourceOrderByRecency(left: TrendingCandidate, right: TrendingCandidate) {
  return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
}

async function buildTrendingList(categoryId: string): Promise<TrendingTopic[]> {
  const category = getCategory(categoryId);
  const query = trendingQueriesByCategory[categoryId];
  if (!category || !query) return [];

  const fetched = await Promise.allSettled([fetchFromSearch(query)]);
  const candidates = cleanCandidates(fetched.flatMap((result) => result.status === "fulfilled" ? result.value : []))
    .filter((candidate) => isSafeTopic(`${candidate.title} ${candidate.summary}`))
    .sort(sourceOrderByRecency)
    .slice(0, 10);
  if (candidates.length < 3) return [];

  const generated = await generateTopicsWithGemini(category.name, candidates);
  const byTitle = new Map(candidates.map((candidate) => [candidate.title, candidate]));
  const topics = generated.flatMap((generatedTopic) => {
    const candidate = byTitle.get(generatedTopic.source_title);
    if (!candidate || generatedTopic.category !== category.name) return [];
    if (!isSafeTopic(`${generatedTopic.topic} ${candidate.title}`)) return [];
    const index = candidates.indexOf(candidate);
    const styles = ["explainer", "pros-cons", "personal-experience"] as const;
    return [{
      topic: generatedTopic.topic,
      category: category.name,
      source_title: candidate.title,
      source_url: candidate.url,
      published_at: candidate.publishedAt,
      source_name: candidate.sourceName,
      style: styles[index % styles.length],
    }];
  });

  const distinct = dedupeBySimilarity(topics, (topic) => topic.topic);
  return distinct.length >= 3 ? distinct : [];
}

export function getTrendingTopicList(categoryId: string, now = Date.now()): Promise<TrendingTopic[]> {
  const current = topicCache.get(categoryId);
  if (current && current.expiresAt > now) return current.pending;

  const pending = buildTrendingList(categoryId);
  topicCache.set(categoryId, { expiresAt: now + CACHE_MS, pending });
  void pending.catch(() => {
    if (topicCache.get(categoryId)?.pending === pending) topicCache.delete(categoryId);
  });
  return pending;
}

export function clearTrendingTopicCache() {
  topicCache.clear();
}
