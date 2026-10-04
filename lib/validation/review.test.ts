import { describe, expect, it, vi } from "vitest";
import { fallbackReview, requestReviewWithFallback, reviewResponseSchema } from "@/lib/validation/review";

describe("review validation fallback", () => {
  it("accepts the required shape", () => {
    expect(reviewResponseSchema.safeParse(fallbackReview()).success).toBe(true);
  });
  it("retries once then returns a numeric-score-friendly fallback", async () => {
    const model = vi.fn().mockResolvedValue({ invalid: true });
    const result = await requestReviewWithFallback(model);
    expect(result.fallback).toBe(true);
    expect(result.review.structure_feedback).toContain("numeric score");
    expect(model).toHaveBeenCalledTimes(2);
  });
});
