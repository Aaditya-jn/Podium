import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { scorePractice } from "@/lib/scoring";

const schema = z.object({
  text: z.string().trim().min(1).max(12_000),
  mode: z.enum(["speak", "write"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  durationSeconds: z.number().finite().min(0).max(7_200),
  typingTelemetry: z.object({
    keystrokeCount: z.number().int().min(0).max(30_000),
    typingDurationMs: z.number().finite().min(0).max(7_200_000),
    flagCount: z.number().int().min(0).max(100),
    tabBlurCount: z.number().int().min(0).max(10_000),
    timeAwayMs: z.number().finite().min(0).max(7_200_000),
  }).optional(),
});

export async function POST(request: Request) {
  if (!consumeRateLimit(`submit:${getRequestIp(request)}`, 15)) return NextResponse.json({ error: "Please wait before submitting another attempt." }, { status: 429 });
  try {
    const text = await request.text();
    if (text.length > 30_000) return NextResponse.json({ error: "That response is too large." }, { status: 413 });
    const data = schema.parse(JSON.parse(text));
    return NextResponse.json(scorePractice(data));
  } catch (error) {
    const message = error instanceof SyntaxError ? "Please send a valid response." : "Please add a response under 12,000 characters.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
