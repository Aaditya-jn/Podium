import { NextResponse } from "next/server";
import { z } from "zod";
import { llm } from "@/lib/llm";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { buildReviewPrompt, fallbackReview, requestReviewWithFallback, reviewJsonSchema } from "@/lib/validation/review";

const schema = z.object({ text: z.string().trim().min(1).max(12_000) });

export async function POST(request: Request) {
  if (!consumeRateLimit(`review:${getRequestIp(request)}`, 8)) return NextResponse.json({ review: fallbackReview(), fallback: true });
  try {
    const raw = await request.text();
    if (raw.length > 30_000) return NextResponse.json({ review: fallbackReview(), fallback: true });
    const { text } = schema.parse(JSON.parse(raw));
    const result = await requestReviewWithFallback(() => llm.generateStructuredJson({ prompt: buildReviewPrompt(text), schema: reviewJsonSchema, temperature: 0.35 }));
    return NextResponse.json(result);
  } catch {
    // Invalid requests and provider failures receive the same graceful fallback.
  }
  return NextResponse.json({ review: fallbackReview(), fallback: true });
}
