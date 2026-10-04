import "server-only";

import { llm } from "@/lib/llm";
import { generatedTopicsSchema } from "@/lib/validation/topic";
import type { TrendingCandidate } from "@/lib/trending/types";
import { buildTrendingPrompt, generatedTopicsJsonSchema } from "@/lib/trending/prompt";

export async function generateTrendingTopics(category: string, candidates: TrendingCandidate[]) {
  const output = await llm.generateStructuredJson({
    prompt: buildTrendingPrompt(category, candidates),
    schema: generatedTopicsJsonSchema,
    temperature: 0.45,
  });
  return generatedTopicsSchema.parse(output);
}
