import { z } from "zod";

import { categories } from "@/lib/config/categories";

export const topicRequestSchema = z.object({
  categoryId: z.string().trim().min(1).max(60),
  customCategory: z.string().trim().max(60).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  recentTopics: z.array(z.string().max(240)).max(20).optional().default([]),
});

export const topicResponseSchema = z.object({
  topic: z.string().min(1).max(240),
  category: z.string().min(1).max(60),
  difficulty: z.enum(["easy", "medium", "hard"]),
  source: z.enum(["curated"]),
});

export function isKnownCategory(categoryId: string) {
  return categories.some((category) => category.id === categoryId);
}
