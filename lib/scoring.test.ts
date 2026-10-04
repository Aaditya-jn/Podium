import { describe, expect, it } from "vitest";
import { scorePractice, verifyTyping } from "@/lib/scoring";

describe("practice scoring", () => {
  it("computes score components and clamps the result", () => {
    const result = scorePractice({ text: "Clear ideas help people understand a useful topic. We can explain examples, compare choices, and share what we learned together.", mode: "write", difficulty: "easy", durationSeconds: 30, typingTelemetry: { keystrokeCount: 120, typingDurationMs: 30000, flagCount: 0, tabBlurCount: 0, timeAwayMs: 0 } });
    expect(result.score).toBeGreaterThan(0);
    expect(result.breakdown).toEqual(expect.objectContaining({ length: expect.any(Number), vocabulary: expect.any(Number), clarity: expect.any(Number), pace: 15 }));
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("flags impossible sustained typing speeds and mismatched text", () => {
    expect(verifyTyping("x".repeat(300), { keystrokeCount: 40, typingDurationMs: 5000, flagCount: 0, tabBlurCount: 0, timeAwayMs: 0 }).flags).toBeGreaterThan(0);
  });

  it("applies five points per client flag and clamps at zero", () => {
    const result = scorePractice({ text: "um uh like", mode: "write", difficulty: "hard", durationSeconds: 1, typingTelemetry: { keystrokeCount: 10, typingDurationMs: 10000, flagCount: 20, tabBlurCount: 0, timeAwayMs: 0 } });
    expect(result.score).toBe(0);
    expect(result.breakdown.antiCheatPenalty).toBeGreaterThanOrEqual(40);
  });
});
