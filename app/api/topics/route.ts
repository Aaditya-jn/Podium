import { NextRequest, NextResponse } from "next/server";

import { getCategory } from "@/lib/config/categories";
import { getTrendingTopicList } from "@/lib/trending/cache";
import { consumeShuffleRateLimit } from "@/lib/trending/rate-limit";
import { selectTopic } from "@/lib/trending/selection";
import { isKnownCategory, topicRequestSchema, topicResponseSchema } from "@/lib/validation/topic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 16_000) return NextResponse.json({ error: "That request is too large." }, { status: 413 });
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Please send a valid JSON request." }, { status: 400 });
  }

  const parsed = topicRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a category and difficulty to get a topic." }, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwardedFor || "unknown";
  if (!consumeShuffleRateLimit(ip)) {
    return NextResponse.json({ error: "Please wait a moment before shuffling again." }, { status: 429 });
  }

  const { categoryId, customCategory, difficulty, recentTopics, recentStyles } = parsed.data;
  if (categoryId === "custom") {
    if (!customCategory) return NextResponse.json({ error: "Add a category name to get a topic." }, { status: 400 });
    const response = topicResponseSchema.parse({
      topic: `What is an idea about ${customCategory} that you wish more people understood?`,
      category: customCategory,
      difficulty,
      source: "classic",
      source_title: "",
      source_url: "",
      published_at: "",
      source_name: "",
      style: "classic",
    });
    return NextResponse.json(response);
  }

  if (!isKnownCategory(categoryId)) {
    return NextResponse.json({ error: "That category is not available yet." }, { status: 400 });
  }

  const category = getCategory(categoryId)!;
  const response = await selectTopic({
    category: category.name,
    difficulty,
    recentTopics,
    recentStyles,
    curatedTopics: category.topics[difficulty],
    trending: () => getTrendingTopicList(categoryId),
  });

  return NextResponse.json(topicResponseSchema.parse(response));
}
