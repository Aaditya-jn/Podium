import type { VisionSample } from "@/lib/vision/types";

export const BASELINE_MS = 3_000;
export const MINIMUM_DELIVERY_SECONDS = 8;
export const SEGMENT_COUNT = 4;

type FaceBaseline = { count: number; eyeDirection: number; headYaw: number; headPitch: number; headRoll: number; browMovement: number; smileAmount: number; mouthActivity: number };
type Bucket = { count: number; faceFrames: number; gazeFrames: number; headMovement: number; browDelta: number; smileEvents: number; mouthDelta: number; blinkEvents: number };

export type DeliverySegment = { label: string; faceVisibilityPercent: number | null; gazeTowardCameraPercent: number | null; headStabilityPercent: number | null; browMovementVariety: number | null; smileFrequencyPerMinute: number | null; mouthActivity: number | null; blinkRatePerMinute: number | null };
export type GesturePostureAccumulator = { startedAt: number; baselineSums: FaceBaseline; baseline: Omit<FaceBaseline, "count"> | null; sampleCount: number; faceFrames: number; confidenceTotal: number; gazeFrames: number; headMovementTotal: number; browDeltaTotal: number; smileEvents: number; mouthDeltaTotal: number; blinkEvents: number; previousSmileActive: boolean; previousBlinkActive: boolean; buckets: Record<number, Bucket>; lastTimestamp: number; pausedAt: number | null };

/** Persistable aggregate-only delivery information. It never includes imagery or landmarks. */
export type GesturePostureMetrics = { durationSeconds: number; facePresencePercent: number; gazeTowardCameraPercent: number; headStabilityPercent: number; browMovementVariety: number; smileFrequencyPerMinute: number; mouthActivity: number; blinkRatePerMinute: number; detectionQualityPercent: number; calibrationComplete: boolean; baselineReady: boolean; lowConfidence: boolean; notEnoughData: boolean; segments: DeliverySegment[] };

function mean(total: number, count: number) { return count ? total / count : 0; }
function round(value: number) { return Math.round(value); }
function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
function emptyBucket(): Bucket { return { count: 0, faceFrames: 0, gazeFrames: 0, headMovement: 0, browDelta: 0, smileEvents: 0, mouthDelta: 0, blinkEvents: 0 }; }
function baselineFrom(sums: FaceBaseline): Omit<FaceBaseline, "count"> { return { eyeDirection: mean(sums.eyeDirection, sums.count), headYaw: mean(sums.headYaw, sums.count), headPitch: mean(sums.headPitch, sums.count), headRoll: mean(sums.headRoll, sums.count), browMovement: mean(sums.browMovement, sums.count), smileAmount: mean(sums.smileAmount, sums.count), mouthActivity: mean(sums.mouthActivity, sums.count) }; }

export function createGesturePostureAccumulator(startedAt: number): GesturePostureAccumulator {
  return { startedAt, baselineSums: { count: 0, eyeDirection: 0, headYaw: 0, headPitch: 0, headRoll: 0, browMovement: 0, smileAmount: 0, mouthActivity: 0 }, baseline: null, sampleCount: 0, faceFrames: 0, confidenceTotal: 0, gazeFrames: 0, headMovementTotal: 0, browDeltaTotal: 0, smileEvents: 0, mouthDeltaTotal: 0, blinkEvents: 0, previousSmileActive: false, previousBlinkActive: false, buckets: {}, lastTimestamp: startedAt, pausedAt: null };
}

/** Adds scalar measurements only. Per-second scalar buckets become a four-part timeline at the end. */
export function addGesturePostureSample(state: GesturePostureAccumulator, sample: VisionSample): GesturePostureAccumulator {
  if (state.pausedAt !== null) state = { ...state, startedAt: state.startedAt + Math.max(0, sample.timestamp - state.pausedAt), pausedAt: null };
  const timestamp = Math.max(state.lastTimestamp, sample.timestamp);
  const elapsed = timestamp - state.startedAt;
  const faceVisible = sample.facePresent && sample.faceConfidence >= 0.35;
  if (!state.baseline && elapsed <= BASELINE_MS) {
    const baselineSums = faceVisible ? { count: state.baselineSums.count + 1, eyeDirection: state.baselineSums.eyeDirection + sample.eyeDirection, headYaw: state.baselineSums.headYaw + sample.headYaw, headPitch: state.baselineSums.headPitch + sample.headPitch, headRoll: state.baselineSums.headRoll + sample.headRoll, browMovement: state.baselineSums.browMovement + sample.browMovement, smileAmount: state.baselineSums.smileAmount + sample.smileAmount, mouthActivity: state.baselineSums.mouthActivity + sample.mouthActivity } : state.baselineSums;
    return { ...state, baselineSums, baseline: elapsed >= BASELINE_MS && baselineSums.count >= 10 ? baselineFrom(baselineSums) : null, lastTimestamp: timestamp };
  }
  if (!state.baseline) return { ...state, lastTimestamp: timestamp };
  const baseline = state.baseline;
  const headMovement = Math.abs(sample.headYaw - baseline.headYaw) + Math.abs(sample.headPitch - baseline.headPitch) + Math.abs(sample.headRoll - baseline.headRoll);
  const gazeToward = faceVisible && Math.abs(sample.eyeDirection - baseline.eyeDirection) <= 0.24 && Math.abs(sample.headYaw - baseline.headYaw) <= 0.28 && Math.abs(sample.headPitch - baseline.headPitch) <= 0.22;
  const browDelta = Math.abs(sample.browMovement - baseline.browMovement);
  const mouthDelta = Math.abs(sample.mouthActivity - baseline.mouthActivity);
  const smileActive = faceVisible && sample.smileAmount > baseline.smileAmount + 0.2;
  const blinkActive = faceVisible && sample.blinkAmount > 0.5;
  const bucketIndex = Math.floor((elapsed - BASELINE_MS) / 1000);
  const bucket = state.buckets[bucketIndex] ?? emptyBucket();
  const nextBucket = { count: bucket.count + 1, faceFrames: bucket.faceFrames + Number(faceVisible), gazeFrames: bucket.gazeFrames + Number(gazeToward), headMovement: bucket.headMovement + (faceVisible ? headMovement : 0), browDelta: bucket.browDelta + (faceVisible ? browDelta : 0), smileEvents: bucket.smileEvents + Number(smileActive && !state.previousSmileActive), mouthDelta: bucket.mouthDelta + (faceVisible ? mouthDelta : 0), blinkEvents: bucket.blinkEvents + Number(blinkActive && !state.previousBlinkActive) };
  return { ...state, sampleCount: state.sampleCount + 1, faceFrames: state.faceFrames + Number(faceVisible), confidenceTotal: state.confidenceTotal + (faceVisible ? sample.faceConfidence : 0), gazeFrames: state.gazeFrames + Number(gazeToward), headMovementTotal: state.headMovementTotal + (faceVisible ? headMovement : 0), browDeltaTotal: state.browDeltaTotal + (faceVisible ? browDelta : 0), smileEvents: state.smileEvents + Number(smileActive && !state.previousSmileActive), mouthDeltaTotal: state.mouthDeltaTotal + (faceVisible ? mouthDelta : 0), blinkEvents: state.blinkEvents + Number(blinkActive && !state.previousBlinkActive), previousSmileActive: smileActive, previousBlinkActive: blinkActive, buckets: { ...state.buckets, [bucketIndex]: nextBucket }, lastTimestamp: timestamp };
}

export function pauseGesturePostureAccumulator(state: GesturePostureAccumulator, timestamp: number): GesturePostureAccumulator { return state.pausedAt === null ? { ...state, pausedAt: Math.max(state.lastTimestamp, timestamp) } : state; }

function makeSegments(state: GesturePostureAccumulator, durationSeconds: number, enoughData: boolean): DeliverySegment[] {
  if (!enoughData) return Array.from({ length: SEGMENT_COUNT }, (_, index) => ({ label: `Part ${index + 1}`, faceVisibilityPercent: null, gazeTowardCameraPercent: null, headStabilityPercent: null, browMovementVariety: null, smileFrequencyPerMinute: null, mouthActivity: null, blinkRatePerMinute: null }));
  const groups = Array.from({ length: SEGMENT_COUNT }, () => emptyBucket());
  for (const [bucketKey, bucket] of Object.entries(state.buckets)) {
    const segment = Math.min(SEGMENT_COUNT - 1, Math.floor(Number(bucketKey) / Math.max(1, durationSeconds) * SEGMENT_COUNT));
    const group = groups[segment];
    groups[segment] = { count: group.count + bucket.count, faceFrames: group.faceFrames + bucket.faceFrames, gazeFrames: group.gazeFrames + bucket.gazeFrames, headMovement: group.headMovement + bucket.headMovement, browDelta: group.browDelta + bucket.browDelta, smileEvents: group.smileEvents + bucket.smileEvents, mouthDelta: group.mouthDelta + bucket.mouthDelta, blinkEvents: group.blinkEvents + bucket.blinkEvents };
  }
  return groups.map((group, index) => { const visible = group.faceFrames; const seconds = durationSeconds / SEGMENT_COUNT; return { label: `Part ${index + 1}`, faceVisibilityPercent: group.count ? round(group.faceFrames / group.count * 100) : null, gazeTowardCameraPercent: visible ? round(group.gazeFrames / visible * 100) : null, headStabilityPercent: visible ? round(clamp(100 - mean(group.headMovement, visible) * 150)) : null, browMovementVariety: visible ? round(clamp(mean(group.browDelta, visible) * 300)) : null, smileFrequencyPerMinute: visible ? round(group.smileEvents / Math.max(seconds / 60, 1 / 60)) : null, mouthActivity: visible ? round(clamp(mean(group.mouthDelta, visible) * 300)) : null, blinkRatePerMinute: visible ? round(group.blinkEvents / Math.max(seconds / 60, 1 / 60)) : null }; });
}

export function getGesturePostureMetrics(state: GesturePostureAccumulator): GesturePostureMetrics {
  const durationSeconds = Math.max(0, (state.lastTimestamp - state.startedAt - BASELINE_MS) / 1000);
  const visible = state.faceFrames;
  const detectionQualityPercent = round(mean(state.confidenceTotal, state.sampleCount) * 100);
  const calibrationComplete = state.lastTimestamp - state.startedAt >= BASELINE_MS;
  const baselineReady = state.baseline !== null;
  const lowConfidence = !baselineReady || detectionQualityPercent < 45 || visible < Math.max(8, state.sampleCount * 0.4);
  const notEnoughData = durationSeconds < MINIMUM_DELIVERY_SECONDS || lowConfidence;
  const minutes = Math.max(durationSeconds / 60, 1 / 60);
  return { durationSeconds: round(durationSeconds), facePresencePercent: state.sampleCount ? round(visible / state.sampleCount * 100) : 0, gazeTowardCameraPercent: visible ? round(state.gazeFrames / visible * 100) : 0, headStabilityPercent: visible ? round(clamp(100 - mean(state.headMovementTotal, visible) * 150)) : 0, browMovementVariety: visible ? round(clamp(mean(state.browDeltaTotal, visible) * 300)) : 0, smileFrequencyPerMinute: round(state.smileEvents / minutes), mouthActivity: visible ? round(clamp(mean(state.mouthDeltaTotal, visible) * 300)) : 0, blinkRatePerMinute: round(state.blinkEvents / minutes), detectionQualityPercent, calibrationComplete, baselineReady, lowConfidence, notEnoughData, segments: makeSegments(state, durationSeconds, !notEnoughData) };
}
