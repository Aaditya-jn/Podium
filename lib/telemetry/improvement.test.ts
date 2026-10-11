import { describe, expect, it } from "vitest";

import {
  createImprovementPayload,
  improvementTelemetrySchema,
  type SelfRating,
} from "@/lib/telemetry/improvement";

describe("Help improve Podium telemetry data format", () => {
  it("creates and validates an anonymized telemetry payload adhering to schema", () => {
    const selfRating: SelfRating = { clarity: 4, pacing: 3, eyeContact: 5 };
    const payload = createImprovementPayload({
      mode: "speak",
      topicCategory: "Technology",
      difficulty: "medium",
      durationSeconds: 65,
      wordCount: 140,
      paceWpm: 129,
      selfRating,
      deliveryMetrics: {
        facePresencePercent: 95,
        gazeTowardCameraPercent: 72,
        headStabilityPercent: 88,
        browMovementVariety: 30,
        smileFrequencyPerMinute: 3,
        mouthActivity: 110,
        blinkRatePerMinute: 16,
        segments: [
          {
            label: "Part 1",
            faceVisibilityPercent: 100,
            gazeTowardCameraPercent: 80,
            headStabilityPercent: 90,
            browMovementVariety: 32,
            smileFrequencyPerMinute: 4,
            mouthActivity: 115,
            blinkRatePerMinute: 15,
          },
        ],
      },
    });

    const parsed = improvementTelemetrySchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(payload.anonymousSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    // Ensure no transcript or images are included
    expect(payload).not.toHaveProperty("text");
    expect(payload).not.toHaveProperty("audio");
    expect(payload).not.toHaveProperty("landmarks");
  });

  it("validates payload without optional delivery metrics for write mode", () => {
    const selfRating: SelfRating = { clarity: 5, pacing: 4, eyeContact: 1 };
    const payload = createImprovementPayload({
      mode: "write",
      topicCategory: "Philosophy",
      difficulty: "hard",
      durationSeconds: 120,
      wordCount: 210,
      paceWpm: 105,
      selfRating,
    });

    const parsed = improvementTelemetrySchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(payload.deliveryMetrics).toBeUndefined();
  });
});
