import { z } from "zod";

import { categories } from "@/lib/config/categories";

const httpUrlSchema = z.url().refine((value) => /^https?:\/\//i.test(value), "URL must use HTTP or HTTPS");

export const topicRequestSchema = z.object({
  categoryId: z.string().trim().min(1).max(60),
  customCategory: z.string().trim().max(60).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  recentTopics: z.array(z.string().max(240)).max(30).optional().default([]),
  recentStyles: z.array(z.enum(["explainer", "pros-cons", "personal-experience", "classic"])).max(30).optional().default([]),
});

export const topicResponseSchema = z.object({
  topic: z.string().min(1).max(240),
  category: z.string().min(1).max(60),
  difficulty: z.enum(["easy", "medium", "hard"]),
  source: z.enum(["trending", "classic"]),
  source_title: z.string().max(220),
  source_url: z.union([httpUrlSchema, z.literal("")]),
  published_at: z.union([z.iso.datetime(), z.literal("")]),
  source_name: z.string().max(80),
  style: z.enum(["explainer", "pros-cons", "personal-experience", "classic"]),
});

export const generatedTopicsSchema = z.array(z.object({
  topic: z.string().trim().min(12).max(240),
  category: z.string().trim().min(1).max(60),
  source_title: z.string().trim().min(1).max(220),
  source_url: z.literal(""),
  published_at: z.literal(""),
}).strict()).min(3).max(10);

export function isKnownCategory(categoryId: string) {
  return categories.some((category) => category.id === categoryId);
}
