import { z } from "zod";
import type { DeliverySegment } from "@/lib/vision/aggregation";

export const selfRatingSchema = z.object({
  clarity: z.number().int().min(1).max(5),
  pacing: z.number().int().min(1).max(5),
  eyeContact: z.number().int().min(1).max(5),
});

export type SelfRating = z.infer<typeof selfRatingSchema>;

export const improvementDeliveryMetricsSchema = z.object({
  facePresencePercent: z.number().min(0).max(100),
  gazeTowardCameraPercent: z.number().min(0).max(100),
  headStabilityPercent: z.number().min(0).max(100),
  browMovementVariety: z.number().min(0).max(500),
  smileFrequencyPerMinute: z.number().min(0).max(200),
  mouthActivity: z.number().min(0).max(500),
  blinkRatePerMinute: z.number().min(0).max(200),
  segments: z.array(
    z.object({
      label: z.string(),
      faceVisibilityPercent: z.number().nullable(),
      gazeTowardCameraPercent: z.number().nullable(),
      headStabilityPercent: z.number().nullable(),
      browMovementVariety: z.number().nullable(),
      smileFrequencyPerMinute: z.number().nullable(),
      mouthActivity: z.number().nullable(),
      blinkRatePerMinute: z.number().nullable(),
    })
  ),
});

export type ImprovementDeliveryMetrics = z.infer<typeof improvementDeliveryMetricsSchema>;

export const improvementTelemetrySchema = z.object({
  anonymousSessionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  mode: z.enum(["speak", "write"]),
  topicCategory: z.string().max(64),
  difficulty: z.enum(["easy", "medium", "hard"]),
  durationSeconds: z.number().int().min(0).max(3600),
  wordCount: z.number().int().min(0).max(10000),
  paceWpm: z.number().int().min(0).max(500),
  selfRating: selfRatingSchema,
  deliveryMetrics: improvementDeliveryMetricsSchema.optional(),
});

/**
 * Anonymized session telemetry package for "Help improve Podium".
 * Groundwork only — never contains text, audio, images, or personally identifiable data.
 */
export type ImprovementTelemetryPayload = z.infer<typeof improvementTelemetrySchema>;

export function createImprovementPayload(params: {
  mode: "speak" | "write";
  topicCategory: string;
  difficulty: "easy" | "medium" | "hard";
  durationSeconds: number;
  wordCount: number;
  paceWpm: number;
  selfRating: SelfRating;
  deliveryMetrics?: {
    facePresencePercent: number;
    gazeTowardCameraPercent: number;
    headStabilityPercent: number;
    browMovementVariety: number;
    smileFrequencyPerMinute: number;
    mouthActivity: number;
    blinkRatePerMinute: number;
    segments: DeliverySegment[];
  };
}): ImprovementTelemetryPayload {
  return {
    anonymousSessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode: params.mode,
    topicCategory: params.topicCategory,
    difficulty: params.difficulty,
    durationSeconds: Math.round(params.durationSeconds),
    wordCount: Math.round(params.wordCount),
    paceWpm: Math.round(params.paceWpm),
    selfRating: params.selfRating,
    deliveryMetrics: params.deliveryMetrics
      ? {
          facePresencePercent: params.deliveryMetrics.facePresencePercent,
          gazeTowardCameraPercent: params.deliveryMetrics.gazeTowardCameraPercent,
          headStabilityPercent: params.deliveryMetrics.headStabilityPercent,
          browMovementVariety: params.deliveryMetrics.browMovementVariety,
          smileFrequencyPerMinute: params.deliveryMetrics.smileFrequencyPerMinute,
          mouthActivity: params.deliveryMetrics.mouthActivity,
          blinkRatePerMinute: params.deliveryMetrics.blinkRatePerMinute,
          segments: params.deliveryMetrics.segments,
        }
      : undefined,
  };
}
