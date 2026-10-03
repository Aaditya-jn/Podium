import { NextRequest, NextResponse } from "next/server";

import { getCategory } from "@/lib/config/categories";
import { isKnownCategory, topicRequestSchema } from "@/lib/validation/topic";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please send a valid JSON request." }, { status: 400 });
  }

  const parsed = topicRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a category and difficulty to get a topic." }, { status: 400 });
  }

  const { categoryId, customCategory, difficulty, recentTopics } = parsed.data;

  if (categoryId === "custom") {
    if (!customCategory) {
      return NextResponse.json({ error: "Add a category name to get a topic." }, { status: 400 });
    }

    return NextResponse.json({
      topic: `What is an idea about ${customCategory} that you wish more people understood?`,
      category: customCategory,
      difficulty,
      source: "curated",
    });
  }

  if (!isKnownCategory(categoryId)) {
    return NextResponse.json({ error: "That category is not available yet." }, { status: 400 });
  }

  const category = getCategory(categoryId)!;
  const choices = category.topics[difficulty];
  const unseen = choices.filter((topic) => !recentTopics.includes(topic));
  const pool = unseen.length > 0 ? unseen : choices;
  const topic = pool[Math.floor(Math.random() * pool.length)];

  return NextResponse.json({
    topic,
    category: category.name,
    difficulty,
    source: "curated",
  });
}
