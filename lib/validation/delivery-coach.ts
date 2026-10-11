import { z } from "zod";

export const deliverySegmentSchema = z.object({
  label: z.string(),
  faceVisibilityPercent: z.number().nullable(),
  gazeTowardCameraPercent: z.number().nullable(),
  headStabilityPercent: z.number().nullable(),
  browMovementVariety: z.number().nullable(),
  smileFrequencyPerMinute: z.number().nullable(),
  mouthActivity: z.number().nullable(),
  blinkRatePerMinute: z.number().nullable(),
});

export const deliveryCoachInputSchema = z.object({
  durationSeconds: z.number().min(0).max(3600),
  facePresencePercent: z.number().min(0).max(100),
  gazeTowardCameraPercent: z.number().min(0).max(100),
  headStabilityPercent: z.number().min(0).max(100),
  browMovementVariety: z.number().min(0).max(500),
  smileFrequencyPerMinute: z.number().min(0).max(200),
  mouthActivity: z.number().min(0).max(500),
  blinkRatePerMinute: z.number().min(0).max(200),
  segments: z.array(deliverySegmentSchema).min(1).max(10),
});

export type DeliveryCoachInput = z.infer<typeof deliveryCoachInputSchema>;

export const deliveryCoachingSchema = z.object({
  observations: z.array(z.string().trim().min(5)).length(3),
  exercises: z.array(z.string().trim().min(5)).length(3),
  strength: z.string().trim().min(5),
});

export type DeliveryCoaching = z.infer<typeof deliveryCoachingSchema>;

export const deliveryCoachingJsonSchema = {
  type: "OBJECT",
  properties: {
    observations: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 3,
      maxItems: 3,
      description: "Three descriptive observations that explicitly cite the numbers. Describe ONLY observable physical behavior without emotion or psychological inference.",
    },
    exercises: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 3,
      maxItems: 3,
      description: "Three physical practice exercises tailored to the observed signals.",
    },
    strength: {
      type: "STRING",
      description: "One notable observable delivery strength citing the metrics.",
    },
  },
  required: ["observations", "exercises", "strength"],
};

export function buildDeliveryCoachingPrompt(input: DeliveryCoachInput): string {
  const segmentSummary = input.segments
    .map(
      (s) =>
        `- ${s.label}: Gaze=${s.gazeTowardCameraPercent !== null ? `${s.gazeTowardCameraPercent}%` : "N/A"}, Stability=${s.headStabilityPercent !== null ? `${s.headStabilityPercent}%` : "N/A"}, Mouth Activity=${s.mouthActivity !== null ? s.mouthActivity : "N/A"}, Smile Freq=${s.smileFrequencyPerMinute !== null ? `${s.smileFrequencyPerMinute}/min` : "N/A"}, Blink Rate=${s.blinkRatePerMinute !== null ? `${s.blinkRatePerMinute}/min` : "N/A"}`
    )
    .join("\n");

  return `You are a supportive, objective delivery coach. Review these descriptive on-device camera delivery metrics and generate structured coaching feedback.

CRITICAL WORDING & ETHICAL RULES:
1. Describe ONLY observable physical behavior (e.g. "Your gaze was toward the camera 62% of the time; it dropped to 48% in the final segment").
2. NEVER infer, claim, or mention emotion, nervousness, confidence, engagement, honesty, anxiety, or personality.
3. Every one of the 3 observations MUST explicitly cite specific numbers from the aggregate metrics or per-segment timeline.
4. Return exactly 3 observations citing the numbers, exactly 3 practice exercises, and exactly 1 strength.

SESSION METRICS:
- Duration: ${input.durationSeconds} seconds
- Face visibility: ${input.facePresencePercent}%
- Gaze toward camera: ${input.gazeTowardCameraPercent}%
- Head stability: ${input.headStabilityPercent}%
- Brow movement variety: ${input.browMovementVariety}
- Smile frequency: ${input.smileFrequencyPerMinute} per minute
- Speaking cadence / mouth activity: ${input.mouthActivity}
- Blink rate: ${input.blinkRatePerMinute} per minute

PER-SEGMENT TIMELINE:
${segmentSummary}

Respond strictly with JSON matching the required schema.`;
}

export function fallbackDeliveryCoaching(input: DeliveryCoachInput): DeliveryCoaching {
  const lastSegment = input.segments[input.segments.length - 1];
  const firstSegment = input.segments[0];

  let gazeTrend = "";
  if (
    firstSegment?.gazeTowardCameraPercent !== null &&
    firstSegment?.gazeTowardCameraPercent !== undefined &&
    lastSegment?.gazeTowardCameraPercent !== null &&
    lastSegment?.gazeTowardCameraPercent !== undefined
  ) {
    gazeTrend = `; it was ${firstSegment.gazeTowardCameraPercent}% in Part 1 and ${lastSegment.gazeTowardCameraPercent}% in the final segment`;
  }

  const observation1 = `Your gaze was toward the camera ${input.gazeTowardCameraPercent}% of the time${gazeTrend}.`;
  const observation2 = `Head stability was measured at ${input.headStabilityPercent}%, tracking orientation consistency relative to your calibration baseline.`;
  const observation3 = `Mouth activity registered at an index of ${input.mouthActivity}, with an average blink rate of ${input.blinkRatePerMinute} per minute across ${input.durationSeconds} seconds.`;

  const strength =
    input.gazeTowardCameraPercent >= 60
      ? `Maintained orientation toward the camera lens for ${input.gazeTowardCameraPercent}% of the session.`
      : input.headStabilityPercent >= 70
        ? `Kept steady head positioning at ${input.headStabilityPercent}% stability relative to initial baseline.`
        : `Maintained consistent face visibility in frame at ${input.facePresencePercent}% throughout the talk.`;

  return {
    observations: [observation1, observation2, observation3],
    exercises: [
      "Camera lens sticky-note drill: Place a small dot near your camera lens to practice keeping gaze orientation centered on the lens.",
      "Segment pacing drill: Practice speaking in 30-second segments, noticing how mouth activity cadence changes between opening and closing points.",
      "Head position awareness drill: Run a 1-minute practice recording keeping your head within a comfortable 10-degree window from your neutral baseline.",
    ],
    strength,
  };
}

export async function requestDeliveryCoachingWithFallback(
  input: DeliveryCoachInput,
  generate: () => Promise<unknown>
): Promise<{ coaching: DeliveryCoaching; fallback: boolean }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = deliveryCoachingSchema.safeParse(await generate());
      if (parsed.success) return { coaching: parsed.data, fallback: false };
    } catch {
      // Retry once on failure
    }
  }
  return { coaching: fallbackDeliveryCoaching(input), fallback: true };
}
