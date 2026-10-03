import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { filterFresh, dedupeBySimilarity, isNearDuplicate } from "@/lib/trending/filters";
import { isSafeTopic } from "@/lib/trending/safety";
import { clearShuffleRateLimit, consumeShuffleRateLimit } from "@/lib/trending/rate-limit";
import { selectTopic } from "@/lib/trending/selection";
import { generatedTopicsSchema, topicRequestSchema, topicResponseSchema } from "@/lib/validation/topic";
import type { TrendingTopic } from "@/lib/trending/types";
import { clearTrendingTopicCache, getTrendingTopicList } from "@/lib/trending/cache";
import { fetchFromSearch } from "@/lib/trending/adapters";

const originalTavilyKey = process.env.TAVILY_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  clearTrendingTopicCache();
  if (originalTavilyKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = originalTavilyKey;
});

const now = Date.parse("2026-10-04T12:00:00.000Z");

describe("trending freshness filter", () => {
  it("keeps only valid publication dates from the last 14 days", () => {
    const items = [
      { title: "Fresh", publishedAt: "2026-10-04T10:00:00.000Z" },
      { title: "Boundary", publishedAt: "2026-09-20T12:00:00.000Z" },
      { title: "Old", publishedAt: "2026-09-19T12:00:00.000Z" },
      { title: "Future", publishedAt: "2026-10-05T12:00:00.000Z" },
      { title: "Invalid", publishedAt: "not-a-date" },
    ];

    expect(filterFresh(items, now).map((item) => item.title)).toEqual(["Fresh", "Boundary"]);
  });
});

describe("Tavily adapter", () => {
  it("requests news from the last 14 days and maps only the approved fields", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    const fetchMock = vi.fn<typeof fetch>(async (_input, _init) => {
      void _input;
      void _init;
      return new Response(JSON.stringify({
        results: [{
          title: "A useful product update",
          url: "https://example.org/story",
          published_date: new Date().toISOString(),
          content: "A short summary.",
          score: 0.99,
          raw_content: "Ignored long content",
        }],
        answer: "Ignored answer",
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFromSearch("new AI tools and product launches");
    const request = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(String(request?.[1]?.body)) as Record<string, unknown>;
    const start = Date.parse(String(requestBody.start_date));
    const end = Date.parse(String(requestBody.end_date));

    expect(requestBody).toMatchObject({ query: "new AI tools and product launches", topic: "news", max_results: 10, filter_by_published_date: true });
    expect(end - start).toBe(14 * 24 * 60 * 60 * 1000);
    expect(result).toEqual([{
      title: "A useful product update",
      summary: "A short summary.",
      url: "https://example.org/story",
      publishedAt: expect.any(String),
      sourceName: "example.org",
    }]);
  });
});

describe("trending deduplication", () => {
  it("removes near-identical headlines and retains distinct stories", () => {
    const result = dedupeBySimilarity([
      { title: "New AI classroom tool helps teachers save time" },
      { title: "AI classroom tool helps teachers save more time" },
      { title: "Local artists map a city's old music venues" },
    ], (item) => item.title);

    expect(result).toHaveLength(2);
    expect(isNearDuplicate("AI classroom tool helps teachers save time", "New AI classroom tool helps teachers save more time")).toBe(true);
  });
});

describe("neutrality safety filter", () => {
  it("blocks sensitive topics and permits open everyday subjects", () => {
    expect(isSafeTopic("Explain the latest election campaign and why voters disagree")).toBe(false);
    expect(isSafeTopic("Discuss a new cancer treatment and its medical advice")).toBe(false);
    expect(isSafeTopic("Explain how cities are making public transport easier to use")).toBe(true);
  });
});

describe("trending topic schemas", () => {
  it("accepts strict model output and rejects model-invented links or extra fields", () => {
    const valid = Array.from({ length: 3 }, (_, index) => ({
      topic: `Explain a new learning tool and why people are discussing it ${index + 1}.`,
      category: "Technology & AI",
      source_title: `Learning tool update ${index + 1}`,
      source_url: "",
      published_at: "",
    }));
    expect(generatedTopicsSchema.safeParse(valid).success).toBe(true);
    expect(generatedTopicsSchema.safeParse([{ ...valid[0], source_url: "https://made-up.example" }, ...valid.slice(1)]).success).toBe(false);
    expect(generatedTopicsSchema.safeParse([{ ...valid[0], unexpected: true }, ...valid.slice(1)]).success).toBe(false);
  });

  it("validates user recent-topic and public response shapes", () => {
    expect(topicRequestSchema.safeParse({ categoryId: "technology-ai", difficulty: "hard", recentTopics: ["A topic"], recentStyles: ["explainer"] }).success).toBe(true);
    expect(topicRequestSchema.safeParse({ categoryId: "technology-ai", difficulty: "expert" }).success).toBe(false);
    expect(topicResponseSchema.safeParse({
      topic: "Explain how a city is improving its public spaces.",
      category: "Society & ideas",
      difficulty: "easy",
      source: "trending",
      source_title: "A city tests a new public-space design",
      source_url: "https://example.org/story",
      published_at: "2026-10-04T10:00:00.000Z",
      source_name: "Example News",
      style: "explainer",
    }).success).toBe(true);
    expect(topicResponseSchema.safeParse({
      topic: "Explain how a city is improving its public spaces.", category: "Society & ideas", difficulty: "easy", source: "trending",
      source_title: "A city tests a new public-space design", source_url: "javascript:alert(1)", published_at: "2026-10-04T10:00:00.000Z",
      source_name: "Example News", style: "explainer",
    }).success).toBe(false);
  });
});

describe("trending fallback", () => {
  it("silently returns an unseen classic topic if a source or model fails", async () => {
    const selected = await selectTopic({
      category: "Everyday life",
      difficulty: "medium",
      recentTopics: ["What does your ideal morning look like?"],
      recentStyles: [],
      curatedTopics: ["What does your ideal morning look like?", "What is your favorite season, and why?"],
      trending: async () => { throw new Error("upstream unavailable"); },
      random: () => 0,
    });

    expect(selected.source).toBe("classic");
    expect(selected.topic).toBe("What is your favorite season, and why?");
    expect(selected.source_url).toBe("");
  });

  it("prefers safe unseen generated topics and rotates away from recent styles", async () => {
    const topics: TrendingTopic[] = [
      { topic: "Explain how cities test new bike routes.", category: "Everyday life", source_title: "New bike routes open", source_url: "https://example.org/1", published_at: new Date(now).toISOString(), source_name: "Example", style: "explainer" },
      { topic: "Discuss possible benefits and challenges of shared work spaces.", category: "Everyday life", source_title: "Shared work spaces expand", source_url: "https://example.org/2", published_at: new Date(now - 86_400_000).toISOString(), source_name: "Example", style: "pros-cons" },
      { topic: "Talk about how a local library fits into your routine.", category: "Everyday life", source_title: "Libraries extend opening hours", source_url: "https://example.org/3", published_at: new Date(now - 172_800_000).toISOString(), source_name: "Example", style: "personal-experience" },
    ];
    const selected = await selectTopic({
      category: "Everyday life",
      difficulty: "easy",
      recentTopics: [],
      recentStyles: ["explainer"],
      curatedTopics: ["A classic topic"],
      trending: async () => topics,
      random: () => 0,
    });

    expect(selected.source).toBe("trending");
    expect(selected.style).not.toBe("explainer");
  });

  it.each([
    ["a Tavily request failure", () => Promise.reject(new Error("Tavily unavailable"))],
    ["an empty Tavily result", () => Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }))],
  ])("silently uses a curated topic after %s", async (_scenario, fetchResult) => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(fetchResult));
    const selected = await selectTopic({
      category: "Everyday life",
      difficulty: "medium",
      recentTopics: [],
      recentStyles: [],
      curatedTopics: ["A classic practice topic."],
      trending: () => getTrendingTopicList("everyday-life"),
      random: () => 0,
    });

    expect(selected.source).toBe("classic");
    expect(selected.topic).toBe("A classic practice topic.");
  });
});

describe("shuffle rate limit", () => {
  it("caps each IP window and allows requests again after it expires", () => {
    clearShuffleRateLimit();
    const start = 10_000;
    for (let request = 0; request < 12; request += 1) expect(consumeShuffleRateLimit("127.0.0.1", start + request)).toBe(true);
    expect(consumeShuffleRateLimit("127.0.0.1", start + 20)).toBe(false);
    expect(consumeShuffleRateLimit("127.0.0.1", start + 60_000)).toBe(true);
    clearShuffleRateLimit();
  });
});
