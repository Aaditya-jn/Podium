import "server-only";

import { z } from "zod";

import type { TrendingCandidate } from "@/lib/trending/types";

export interface SearchAdapter {
  search(query: string): Promise<TrendingCandidate[]>;
}

const tavilyResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string().url(),
    published_date: z.string().nullable().optional(),
    content: z.string().optional(),
  })),
});

function sourceNameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Tavily";
  }
}

export const tavilyAdapter: SearchAdapter = {
  async search(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");

    const now = new Date();
    const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        topic: "news",
        max_results: 10,
        start_date: start.toISOString().slice(0, 10),
        end_date: now.toISOString().slice(0, 10),
        include_published_date: true,
        filter_by_published_date: true,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`);

    const payload = tavilyResponseSchema.parse(await response.json());
    return payload.results.flatMap((result) => {
      if (!result.published_date) return [];
      return [{
        // Treat every Tavily field as untrusted input. Existing cleaning,
        // freshness, deduplication and safety filters run before prompting.
        title: result.title.slice(0, 220),
        summary: (result.content ?? "").slice(0, 420),
        url: result.url,
        publishedAt: result.published_date,
        sourceName: sourceNameFor(result.url),
      }];
    });
  },
};

export async function fetchFromSearch(query: string, adapter: SearchAdapter = tavilyAdapter): Promise<TrendingCandidate[]> {
  return adapter.search(query);
}
