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

export const voiceSignalTogglesSchema = z.object({
  pauses: z.boolean(),
  volume: z.boolean(),
  pitch: z.boolean(),
  pace: z.boolean(),
  fillers: z.boolean(),
});

export const voiceSegmentSchema = z.object({
  label: z.string(),
  analyzedSeconds: z.number().min(0).max(3_600),
  pauseCount: z.number().int().min(0).max(10_000).nullable(),
  shortPauseCount: z.number().int().min(0).max(10_000).nullable(),
  longPauseCount: z.number().int().min(0).max(10_000).nullable(),
  silentPercent: z.number().min(0).max(100).nullable(),
  meanVolumeDbRelative: z.number().min(-200).max(100).nullable(),
  volumeVariationDb: z.number().min(0).max(200).nullable(),
  trailingOffCount: z.number().int().min(0).max(10_000).nullable(),
  pitchVarietySemitones: z.number().min(0).max(100).nullable(),
  pitchMedianHz: z.number().min(0).max(1_000).nullable(),
  paceWpm: z.number().min(0).max(1_000).nullable(),
  paceFlag: z.enum(["faster", "slower"]).nullable(),
  speechActivityPercent: z.number().min(0).max(100).nullable(),
  fillerCount: z.number().int().min(0).max(10_000).nullable(),
  fillerRatePerMinute: z.number().min(0).max(1_000).nullable(),
});

export const voiceAggregatesSchema = z.object({
  durationSeconds: z.number().min(0).max(3_600),
  analyzedSeconds: z.number().min(0).max(3_600),
  calibrationComplete: z.boolean(),
  noiseFloorDbfs: z.number().min(-200).max(20),
  speechLevelDbfs: z.number().min(-200).max(20),
  speechToNoiseDb: z.number().min(-200).max(200),
  tooQuiet: z.boolean(),
  lowConfidence: z.boolean(),
  notEnoughData: z.boolean(),
  signals: voiceSignalTogglesSchema,

  pauseCount: z.number().int().min(0).max(10_000).nullable(),
  shortPauseCount: z.number().int().min(0).max(10_000).nullable(),
  longPauseCount: z.number().int().min(0).max(10_000).nullable(),
  averagePauseSeconds: z.number().min(0).max(3_600).nullable(),
  longestPauseSeconds: z.number().min(0).max(3_600).nullable(),
  silentPercent: z.number().min(0).max(100).nullable(),

  meanVolumeDbRelative: z.number().min(-200).max(100).nullable(),
  volumeVariationDb: z.number().min(0).max(200).nullable(),
  trailingOffCount: z.number().int().min(0).max(10_000).nullable(),
  trailingOffRatio: z.number().min(0).max(100).nullable(),

  pitchMedianHz: z.number().min(0).max(1_000).nullable(),
  pitchRangeSemitones: z.number().min(0).max(100).nullable(),
  pitchVariationSemitones: z.number().min(0).max(100).nullable(),
  pitchVariety: z.enum(["monotone", "some variation", "varied"]).nullable(),
  voicedFramePercent: z.number().min(0).max(100).nullable(),

  wordsPerMinute: z.number().min(0).max(1_000).nullable(),
  speechActivityPercent: z.number().min(0).max(100).nullable(),
  paceTrend: z.enum(["steady", "faster", "slower"]).nullable(),

  fillerCount: z.number().int().min(0).max(10_000).nullable(),
  fillerRatePerMinute: z.number().min(0).max(1_000).nullable(),
  fillerCountApproximate: z.literal(true).optional(),

  segments: z.array(voiceSegmentSchema).min(1).max(10),
});

export const deliveryCoachInputSchema = z
  .object({
    durationSeconds: z.number().min(0).max(3_600),
    facePresencePercent: z.number().min(0).max(100).optional(),
    gazeTowardCameraPercent: z.number().min(0).max(100).optional(),
    headStabilityPercent: z.number().min(0).max(100).optional(),
    browMovementVariety: z.number().min(0).max(500).optional(),
    smileFrequencyPerMinute: z.number().min(0).max(200).optional(),
    mouthActivity: z.number().min(0).max(500).optional(),
    blinkRatePerMinute: z.number().min(0).max(200).optional(),
    segments: z.array(deliverySegmentSchema).min(1).max(10).optional(),
    voice: voiceAggregatesSchema.optional(),
  })
  .refine((input) => input.facePresencePercent !== undefined || input.voice !== undefined, {
    message: "Provide camera metrics, voice metrics, or both",
  });

export type DeliveryCoachInput = z.infer<typeof deliveryCoachInputSchema>;
export type VoiceAggregatesInput = z.infer<typeof voiceAggregatesSchema>;

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
      description: "Three descriptive observations that explicitly cite the numbers. Describe ONLY observable behavior without emotion or psychological inference.",
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

function cameraSegmentSummary(input: DeliveryCoachInput): string {
  return (input.segments ?? [])
    .map(
      (s) =>
        `- ${s.label}: Gaze=${s.gazeTowardCameraPercent !== null ? `${s.gazeTowardCameraPercent}%` : "N/A"}, Stability=${s.headStabilityPercent !== null ? `${s.headStabilityPercent}%` : "N/A"}, Mouth Activity=${s.mouthActivity !== null ? s.mouthActivity : "N/A"}, Smile Freq=${s.smileFrequencyPerMinute !== null ? `${s.smileFrequencyPerMinute}/min` : "N/A"}, Blink Rate=${s.blinkRatePerMinute !== null ? `${s.blinkRatePerMinute}/min` : "N/A"}`
    )
    .join("\n");
}

function voiceSegmentSummary(voice: VoiceAggregatesInput): string {
  return voice.segments
    .map(
      (s) =>
        `- ${s.label}: Pauses=${s.pauseCount ?? "off"} (${s.longPauseCount ?? 0} long), Silent=${s.silentPercent !== null ? `${s.silentPercent}%` : "off"}, Volume variation=${s.volumeVariationDb !== null ? `${s.volumeVariationDb} dB` : "off"}, Trailing off=${s.trailingOffCount ?? "off"}, Pitch variety=${s.pitchVarietySemitones !== null ? `${s.pitchVarietySemitones} semitones` : "off"}, Pace=${s.paceWpm !== null ? `${s.paceWpm} wpm${s.paceFlag ? ` (${s.paceFlag})` : ""}` : "off"}, Fillers=${s.fillerCount !== null ? `${s.fillerCount} (approx.)` : "off"}`
    )
    .join("\n");
}

function cameraPromptBlock(input: DeliveryCoachInput): string {
  if (input.facePresencePercent === undefined) return "";
  return `CAMERA METRICS:
- Duration: ${input.durationSeconds} seconds
- Face visibility: ${input.facePresencePercent}%
- Gaze toward camera: ${input.gazeTowardCameraPercent ?? "N/A"}%
- Head stability: ${input.headStabilityPercent ?? "N/A"}%
- Brow movement variety: ${input.browMovementVariety ?? "N/A"}
- Smile frequency: ${input.smileFrequencyPerMinute ?? "N/A"} per minute
- Speaking cadence / mouth activity: ${input.mouthActivity ?? "N/A"}
- Blink rate: ${input.blinkRatePerMinute ?? "N/A"} per minute

CAMERA PER-SEGMENT TIMELINE:
${cameraSegmentSummary(input)}`;
}

function voicePromptBlock(voice: VoiceAggregatesInput): string {
  const pauses = voice.signals.pauses
    ? `${voice.pauseCount} total (${voice.shortPauseCount} short, ${voice.longPauseCount} long); longest ${voice.longestPauseSeconds}s; ${voice.silentPercent}% of analysed time silent`
    : "opted out";
  const volume = voice.signals.volume
    ? `variation ${voice.volumeVariationDb} dB around your own baseline; ${voice.trailingOffCount} run(s) trailed off at the end (${voice.trailingOffRatio}% of runs); too quiet: ${voice.tooQuiet ? "yes" : "no"}`
    : "opted out";
  const pitch = voice.signals.pitch
    ? `median ${voice.pitchMedianHz} Hz; range ${voice.pitchRangeSemitones} semitones; variation ${voice.pitchVariationSemitones} semitones (${voice.pitchVariety})`
    : "opted out";
  const pace = voice.signals.pace
    ? `${voice.wordsPerMinute} words per minute over active speech; ${voice.speechActivityPercent}% speech activity; trend: ${voice.paceTrend}`
    : "opted out";
  const fillers = voice.signals.fillers
    ? `${voice.fillerCount} (${voice.fillerRatePerMinute}/min) — APPROXIMATE because browser transcription often drops um/uh`
    : "opted out";

  return `VOICE METRICS (on-device, numbers only):
- Analysed duration: ${voice.analyzedSeconds} seconds after a 2.5-second noise-floor calibration
- Signal-to-noise: ${voice.speechToNoiseDb} dB; quiet-signal warning: ${voice.tooQuiet ? "yes" : "no"}
- Pauses: ${pauses}
- Volume: ${volume}
- Pitch: ${pitch}
- Pace: ${pace}
- Fillers: ${fillers}

VOICE PER-SEGMENT TIMELINE:
${voiceSegmentSummary(voice)}`;
}

export function buildDeliveryCoachingPrompt(input: DeliveryCoachInput): string {
  const sections = [cameraPromptBlock(input), input.voice ? voicePromptBlock(input.voice) : ""]
    .filter(Boolean)
    .join("\n\n");

  return `You are a supportive, objective delivery coach. Review these descriptive on-device delivery metrics and generate structured coaching feedback.

CRITICAL WORDING & ETHICAL RULES:
1. Describe ONLY observable behavior (e.g. "Your gaze was toward the camera 62% of the time; it dropped to 48% in the final segment" or "Your longest pause was 4.1 seconds and pace rose from 132 to 168 words per minute").
2. NEVER infer, claim, or mention emotion, nervousness, confidence, engagement, honesty, anxiety, or personality.
3. Do not label pitch or volume as an emotion. Report pitch range, variation and loudness changes only as measurements.
4. Every one of the 3 observations MUST explicitly cite specific numbers from the aggregate metrics or per-segment timeline.
5. Voice measurements are affected by microphones, background noise, room acoustics and accents. Filler counts are approximate because browser transcription often drops "um" and "uh".
6. Return exactly 3 observations citing the numbers, exactly 3 practice exercises, and exactly 1 strength.

${sections}

Respond strictly with JSON matching the required schema.`;
}

function cameraObservations(input: DeliveryCoachInput): string[] {
  if (input.gazeTowardCameraPercent === undefined) return [];
  const segments = input.segments ?? [];
  const lastSegment = segments[segments.length - 1];
  const firstSegment = segments[0];
  let gazeTrend = "";
  if (
    firstSegment?.gazeTowardCameraPercent !== null &&
    firstSegment?.gazeTowardCameraPercent !== undefined &&
    lastSegment?.gazeTowardCameraPercent !== null &&
    lastSegment?.gazeTowardCameraPercent !== undefined
  ) {
    gazeTrend = `; it was ${firstSegment.gazeTowardCameraPercent}% in Part 1 and ${lastSegment.gazeTowardCameraPercent}% in the final segment`;
  }

  return [
    `Your gaze was toward the camera ${input.gazeTowardCameraPercent}% of the time${gazeTrend}.`,
    `Head stability was measured at ${input.headStabilityPercent ?? "N/A"}%, tracking orientation consistency relative to your calibration baseline.`,
    `Mouth activity registered at an index of ${input.mouthActivity ?? "N/A"}, with an average blink rate of ${input.blinkRatePerMinute ?? "N/A"} per minute across ${input.durationSeconds} seconds.`,
  ];
}

function voiceObservations(voice: VoiceAggregatesInput): string[] {
  const observations: string[] = [];
  if (voice.signals.pauses) {
    observations.push(
      `You had ${voice.pauseCount} pauses of at least 0.3 seconds; the longest was ${voice.longestPauseSeconds} seconds and ${voice.silentPercent}% of measured speaking time was silent.`
    );
  }
  if (voice.signals.volume) {
    observations.push(
      `Your volume varied by ${voice.volumeVariationDb} dB around your own baseline, and ${voice.trailingOffCount} sentence-length run${voice.trailingOffCount === 1 ? "" : "s"} trailed off at the end.`
    );
  }
  if (voice.signals.pitch) {
    observations.push(
      `Your median pitch was ${voice.pitchMedianHz} Hz with a ${voice.pitchRangeSemitones}-semitone range (${voice.pitchVariety} across ${voice.voicedFramePercent}% voiced frames).`
    );
  }
  if (voice.signals.pace) {
    observations.push(
      `Pace was ${voice.wordsPerMinute} words per minute across ${voice.speechActivityPercent}% speech activity; the measured trend was ${voice.paceTrend}.`
    );
  }
  if (voice.signals.fillers) {
    observations.push(
      `About ${voice.fillerCount} filler words were transcribed (${voice.fillerRatePerMinute} per minute, approximate because browser transcription may drop um and uh).`
    );
  }
  observations.push(
    `Across ${voice.analyzedSeconds} seconds of analysed speech, the microphone signal sat ${voice.speechToNoiseDb} dB above the measured noise floor.`
  );
  observations.push(
    `Speech activity occupied ${voice.speechActivityPercent}% of the measured session, based on on-device level detection.`
  );
  return observations;
}

function chooseObservations(input: DeliveryCoachInput): string[] {
  const camera = cameraObservations(input);
  const voice = input.voice ? voiceObservations(input.voice) : [];
  let chosen: string[];
  if (camera.length && voice.length) chosen = [camera[0], camera[1], voice[0]];
  else if (camera.length) chosen = camera;
  else chosen = voice;
  while (chosen.length < 3) chosen.push(`The measured session lasted ${input.durationSeconds} seconds and contains enough data for these descriptive signals.`);
  return chosen.slice(0, 3);
}

function chooseStrength(input: DeliveryCoachInput): string {
  if (input.gazeTowardCameraPercent !== undefined && input.gazeTowardCameraPercent >= 60) {
    return `Maintained orientation toward the camera lens for ${input.gazeTowardCameraPercent}% of the session.`;
  }
  if (input.headStabilityPercent !== undefined && input.headStabilityPercent >= 70) {
    return `Kept steady head positioning at ${input.headStabilityPercent}% stability relative to initial baseline.`;
  }
  const voice = input.voice;
  if (voice?.signals.pauses && voice.silentPercent !== null && voice.silentPercent <= 25) {
    return `Kept silent time to ${voice.silentPercent}% with ${voice.pauseCount} pauses of at least 0.3 seconds.`;
  }
  if (voice?.signals.pace && voice.wordsPerMinute !== null) {
    return `Held a measurable pace of ${voice.wordsPerMinute} words per minute across ${voice.speechActivityPercent}% speech activity.`;
  }
  if (voice?.signals.pitch && voice.pitchVariety !== null) {
    return `Produced a ${voice.pitchRangeSemitones}-semitone pitch range with ${voice.pitchVariety} across the session.`;
  }
  if (voice?.signals.volume && voice.volumeVariationDb !== null) {
    return `Kept volume variation to ${voice.volumeVariationDb} dB around your own calibrated baseline.`;
  }
  if (input.facePresencePercent !== undefined) {
    return `Maintained consistent face visibility in frame at ${input.facePresencePercent}% throughout the talk.`;
  }
  return `Completed ${input.durationSeconds} seconds of measurable delivery data with the microphone signal ${input.voice?.speechToNoiseDb ?? 0} dB above the noise floor.`;
}

function chooseExercises(input: DeliveryCoachInput): string[] {
  const exercises: string[] = [];
  const voice = input.voice;
  if (voice?.signals.pauses) {
    exercises.push("Pause placement drill: read a short paragraph aloud and mark three deliberate 1-second pauses at punctuation, then check that each pause stays close to that length.");
  }
  if (voice?.signals.volume) {
    exercises.push("Projection ladder drill: say the same sentence at three increasing distances from the microphone and notice how your relative dB level changes.");
  }
  if (voice?.signals.pitch) {
    exercises.push("Pitch range drill: read a list of five items, placing the important word of each item on a slightly different pitch, and compare the resulting semitone range.");
  }
  if (voice?.signals.pace) {
    exercises.push("Pace checkpoints drill: speak a 60-second answer and count words in each 15-second quarter, looking for changes between the opening and closing pace.");
  }
  if (voice?.signals.fillers) {
    exercises.push("Filler reset drill: pause for half a second instead of saying um, uh or like, and transcribe a 1-minute answer to estimate the filler rate.");
  }
  if (input.facePresencePercent !== undefined) {
    exercises.push("Camera lens sticky-note drill: place a small dot near your camera lens to practice keeping gaze orientation centered on the lens.");
    exercises.push("Segment pacing drill: practice speaking in 30-second segments, noticing how mouth activity cadence changes between opening and closing points.");
    exercises.push("Head position awareness drill: run a 1-minute practice recording keeping your head within a comfortable 10-degree window from your neutral baseline.");
  }
  exercises.push("Calibration check: record 30 seconds in the same room and microphone position to establish a stable noise floor for future comparisons.");
  exercises.push("Segment review drill: replay a practice answer and note one observable change between the opening and closing third.");
  exercises.push("One-minute repeat drill: answer the same prompt twice and compare the measured pace, pause count and volume variation.");
  return exercises.slice(0, 3);
}

export function fallbackDeliveryCoaching(input: DeliveryCoachInput): DeliveryCoaching {
  return {
    observations: chooseObservations(input),
    exercises: chooseExercises(input),
    strength: chooseStrength(input),
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
