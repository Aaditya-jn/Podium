import { describe, expect, it } from "vitest";

import {
  buildDeliveryCoachingPrompt,
  deliveryCoachingSchema,
  fallbackDeliveryCoaching,
  requestDeliveryCoachingWithFallback,
  type DeliveryCoachInput,
} from "@/lib/validation/delivery-coach";

const sampleInput: DeliveryCoachInput = {
  durationSeconds: 45,
  facePresencePercent: 98,
  gazeTowardCameraPercent: 62,
  headStabilityPercent: 84,
  browMovementVariety: 35,
  smileFrequencyPerMinute: 4,
  mouthActivity: 110,
  blinkRatePerMinute: 18,
  segments: [
    {
      label: "Part 1",
      faceVisibilityPercent: 100,
      gazeTowardCameraPercent: 75,
      headStabilityPercent: 90,
      browMovementVariety: 30,
      smileFrequencyPerMinute: 5,
      mouthActivity: 120,
      blinkRatePerMinute: 16,
    },
    {
      label: "Part 2",
      faceVisibilityPercent: 100,
      gazeTowardCameraPercent: 68,
      headStabilityPercent: 86,
      browMovementVariety: 32,
      smileFrequencyPerMinute: 4,
      mouthActivity: 115,
      blinkRatePerMinute: 18,
    },
    {
      label: "Part 3",
      faceVisibilityPercent: 96,
      gazeTowardCameraPercent: 55,
      headStabilityPercent: 82,
      browMovementVariety: 40,
      smileFrequencyPerMinute: 3,
      mouthActivity: 105,
      blinkRatePerMinute: 19,
    },
    {
      label: "Part 4",
      faceVisibilityPercent: 96,
      gazeTowardCameraPercent: 50,
      headStabilityPercent: 78,
      browMovementVariety: 38,
      smileFrequencyPerMinute: 4,
      mouthActivity: 100,
      blinkRatePerMinute: 20,
    },
  ],
};

describe("delivery coaching validation and fallback", () => {
  it("validates structured coaching output adhering to schema", () => {
    const valid = {
      observations: [
        "Your gaze was toward the camera 62% of the time, dropping from 75% in Part 1 to 50% in Part 4.",
        "Head stability was measured at 84%, reflecting minimal lateral movement.",
        "Mouth activity registered at 110 with a steady 18 blinks per minute.",
      ],
      exercises: [
        "Position a sticky note right above your webcam lens as a focal target.",
        "Practice delivering closing remarks while intentionally keeping eye orientation forward.",
        "Record a 30-second response observing natural head movement ranges.",
      ],
      strength: "Strong initial orientation toward the lens, maintaining 75% gaze in the opening quarter.",
    };

    const parsed = deliveryCoachingSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects coaching output missing required counts or fields", () => {
    const invalid = {
      observations: ["Only one observation with 62% gaze."],
      exercises: ["Exercise 1"],
      strength: "",
    };
    const parsed = deliveryCoachingSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("constructs a prompt that forbids emotion inference and includes metrics", () => {
    const prompt = buildDeliveryCoachingPrompt(sampleInput);
    expect(prompt).toContain("NEVER infer, claim, or mention emotion");
    expect(prompt).toContain("62%");
    expect(prompt).toContain("84%");
    expect(prompt).toContain("Part 1");
    expect(prompt).toContain("Part 4");
  });

  it("provides rule-based fallback citing numbers with exactly 3 observations, 3 exercises, and 1 strength", () => {
    const fallback = fallbackDeliveryCoaching(sampleInput);
    const parsed = deliveryCoachingSchema.safeParse(fallback);
    expect(parsed.success).toBe(true);
    expect(fallback.observations).toHaveLength(3);
    expect(fallback.exercises).toHaveLength(3);
    expect(typeof fallback.strength).toBe("string");
    expect(fallback.observations[0]).toContain("62%");
    expect(fallback.observations[1]).toContain("84%");
  });

  it("returns generated coaching when LLM succeeds, and falls back on error", async () => {
    const validCoaching = {
      observations: [
        "Observation 1 citing 62% gaze toward camera.",
        "Observation 2 citing 84% head stability index.",
        "Observation 3 citing mouth activity of 110.",
      ],
      exercises: ["Exercise 1", "Exercise 2", "Exercise 3"],
      strength: "Strength citing steady orientation.",
    };

    const success = await requestDeliveryCoachingWithFallback(sampleInput, async () => validCoaching);
    expect(success.fallback).toBe(false);
    expect(success.coaching.observations[0]).toContain("62%");

    const failure = await requestDeliveryCoachingWithFallback(sampleInput, async () => {
      throw new Error("Gemini quota exceeded");
    });
    expect(failure.fallback).toBe(true);
    expect(failure.coaching.observations).toHaveLength(3);
    expect(failure.coaching.observations[0]).toContain("62%");
  });
});
