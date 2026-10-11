import { NextResponse } from "next/server";
import { llm } from "@/lib/llm";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import {
  deliveryCoachInputSchema,
  fallbackDeliveryCoaching,
  requestDeliveryCoachingWithFallback,
  buildDeliveryCoachingPrompt,
  deliveryCoachingJsonSchema,
} from "@/lib/validation/delivery-coach";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deliveryCoachInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid delivery metrics format" }, { status: 400 });
  }

  const input = parsed.data;
  if (!consumeRateLimit(`delivery-review:${getRequestIp(request)}`, 8)) {
    return NextResponse.json({ coaching: fallbackDeliveryCoaching(input), fallback: true });
  }

  try {
    const result = await requestDeliveryCoachingWithFallback(input, () =>
      llm.generateStructuredJson({
        prompt: buildDeliveryCoachingPrompt(input),
        schema: deliveryCoachingJsonSchema,
        temperature: 0.35,
      })
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ coaching: fallbackDeliveryCoaching(input), fallback: true });
  }
}
