import type { VisionSample } from "@/lib/vision/types";

export const BASELINE_MS = 3_000;

type BaselineSums = {
  count: number;
  handMovement: number;
  shoulderTilt: number;
  torsoLean: number;
  shoulderDepth: number;
};

export type GesturePostureAccumulator = {
  startedAt: number;
  baselineSums: BaselineSums;
  baseline: { handMovement: number; shoulderTilt: number; torsoLean: number; shoulderDepth: number } | null;
  sampleCount: number;
  faceFrames: number;
  handFrames: number;
  poseFrames: number;
  confidenceTotal: number;
  gestureEvents: number;
  previousGestureActive: boolean;
  fidgetEvents: number;
  previousDeltaX: number;
  previousDeltaY: number;
  shoulderTiltTotal: number;
  torsoLeanTotal: number;
  shoulderDepthTotal: number;
  slouchFrames: number;
  measurementFrames: number;
  lastTimestamp: number;
  pausedAt: number | null;
};

export type GesturePostureMetrics = {
  durationSeconds: number;
  facePresencePercent: number;
  handsInFramePercent: number;
  gestureActivityPerMinute: number;
  averageShoulderTiltChangeDegrees: number;
  averageTorsoLeanChangeDegrees: number;
  shoulderDepthChange: number;
  slouchTrendPercent: number;
  fidgetMovementsPerMinute: number;
  detectionQualityPercent: number;
  calibrationComplete: boolean;
  baselineReady: boolean;
  lowConfidence: boolean;
};

function mean(total: number, count: number) {
  return count === 0 ? 0 : total / count;
}

function withBaseline(baselineSums: BaselineSums) {
  return {
    handMovement: mean(baselineSums.handMovement, baselineSums.count),
    shoulderTilt: mean(baselineSums.shoulderTilt, baselineSums.count),
    torsoLean: mean(baselineSums.torsoLean, baselineSums.count),
    shoulderDepth: mean(baselineSums.shoulderDepth, baselineSums.count),
  };
}

export function createGesturePostureAccumulator(startedAt: number): GesturePostureAccumulator {
  return {
    startedAt,
    baselineSums: { count: 0, handMovement: 0, shoulderTilt: 0, torsoLean: 0, shoulderDepth: 0 },
    baseline: null,
    sampleCount: 0,
    faceFrames: 0,
    handFrames: 0,
    poseFrames: 0,
    confidenceTotal: 0,
    gestureEvents: 0,
    previousGestureActive: false,
    fidgetEvents: 0,
    previousDeltaX: 0,
    previousDeltaY: 0,
    shoulderTiltTotal: 0,
    torsoLeanTotal: 0,
    shoulderDepthTotal: 0,
    slouchFrames: 0,
    measurementFrames: 0,
    lastTimestamp: startedAt,
    pausedAt: null,
  };
}

function finiteOrZero(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Add only derived measurements and running sums; raw landmarks are never retained. */
export function addGesturePostureSample(state: GesturePostureAccumulator, sample: VisionSample): GesturePostureAccumulator {
  if (state.pausedAt !== null) {
    const pausedDuration = Math.max(0, sample.timestamp - state.pausedAt);
    state = { ...state, startedAt: state.startedAt + pausedDuration, pausedAt: null };
  }
  const timestamp = Math.max(state.lastTimestamp, sample.timestamp);
  const elapsed = timestamp - state.startedAt;
  const observedPose = sample.poseConfidence >= 0.35;
  const safeSample = {
    ...sample,
    handDeltaX: finiteOrZero(sample.handDeltaX),
    handDeltaY: finiteOrZero(sample.handDeltaY),
    shoulderTiltDegrees: sample.shoulderTiltDegrees ?? 0,
    torsoLeanDegrees: sample.torsoLeanDegrees ?? 0,
    shoulderDepth: sample.shoulderDepth ?? 0,
  };

  if (!state.baseline && elapsed <= BASELINE_MS && observedPose) {
    const baselineSums = {
      count: state.baselineSums.count + 1,
      handMovement: state.baselineSums.handMovement + Math.hypot(safeSample.handDeltaX, safeSample.handDeltaY),
      shoulderTilt: state.baselineSums.shoulderTilt + safeSample.shoulderTiltDegrees,
      torsoLean: state.baselineSums.torsoLean + safeSample.torsoLeanDegrees,
      shoulderDepth: state.baselineSums.shoulderDepth + safeSample.shoulderDepth,
    };
    const baseline = elapsed >= BASELINE_MS ? withBaseline(baselineSums) : null;
    return { ...state, baselineSums, baseline, lastTimestamp: timestamp };
  }

  // If the first three seconds had insufficient pose visibility, keep calibrating
  // only until the window ends. Don't invent a baseline from later movement.
  if (!state.baseline && elapsed < BASELINE_MS) return { ...state, lastTimestamp: timestamp };

  const baseline = state.baseline ?? withBaseline(state.baselineSums);
  const calibratedBaseline = state.baseline ?? (state.baselineSums.count >= 10 ? baseline : null);
  const movement = Math.hypot(safeSample.handDeltaX, safeSample.handDeltaY);
  const gestureActive = sample.handsPresent && movement > Math.max(0.025, baseline.handMovement * 2.2 + 0.012);
  const smallReversal = sample.handsPresent
    && movement >= 0.003
    && movement <= 0.028
    && safeSample.handDeltaX * state.previousDeltaX + safeSample.handDeltaY * state.previousDeltaY < -0.00001;
  const tiltChange = Math.abs(safeSample.shoulderTiltDegrees - baseline.shoulderTilt);
  const leanChange = Math.abs(safeSample.torsoLeanDegrees - baseline.torsoLean);
  const depthChange = Math.abs(safeSample.shoulderDepth - baseline.shoulderDepth);
  const hasMeasurement = observedPose;

  return {
    ...state,
    baseline: calibratedBaseline,
    sampleCount: state.sampleCount + 1,
    faceFrames: state.faceFrames + Number(sample.facePresent),
    handFrames: state.handFrames + Number(sample.handsPresent),
    poseFrames: state.poseFrames + Number(observedPose),
    confidenceTotal: state.confidenceTotal + sample.poseConfidence,
    gestureEvents: state.gestureEvents + Number(gestureActive && !state.previousGestureActive),
    previousGestureActive: gestureActive,
    fidgetEvents: state.fidgetEvents + Number(smallReversal),
    previousDeltaX: safeSample.handDeltaX,
    previousDeltaY: safeSample.handDeltaY,
    shoulderTiltTotal: state.shoulderTiltTotal + (hasMeasurement ? tiltChange : 0),
    torsoLeanTotal: state.torsoLeanTotal + (hasMeasurement ? leanChange : 0),
    shoulderDepthTotal: state.shoulderDepthTotal + (hasMeasurement ? depthChange : 0),
    slouchFrames: state.slouchFrames + Number(hasMeasurement && depthChange > 0.035),
    measurementFrames: state.measurementFrames + Number(hasMeasurement),
    lastTimestamp: timestamp,
  };
}

export function pauseGesturePostureAccumulator(state: GesturePostureAccumulator, timestamp: number): GesturePostureAccumulator {
  return state.pausedAt === null ? { ...state, pausedAt: Math.max(state.lastTimestamp, timestamp) } : state;
}

export function getGesturePostureMetrics(state: GesturePostureAccumulator): GesturePostureMetrics {
  const durationSeconds = Math.max(0, (state.lastTimestamp - state.startedAt - BASELINE_MS) / 1000);
  const minutes = Math.max(durationSeconds / 60, 1 / 60);
  const sampleCount = state.sampleCount;
  const detectionQualityPercent = Math.round(mean(state.confidenceTotal, sampleCount) * 100);
  const calibrationComplete = state.lastTimestamp - state.startedAt >= BASELINE_MS;
  const baselineReady = state.baseline !== null;
  const lowConfidence = calibrationComplete && (!baselineReady || state.poseFrames < Math.max(5, sampleCount * 0.4) || detectionQualityPercent < 45);
  return {
    durationSeconds: Math.round(durationSeconds),
    facePresencePercent: sampleCount ? Math.round(state.faceFrames / sampleCount * 100) : 0,
    handsInFramePercent: sampleCount ? Math.round(state.handFrames / sampleCount * 100) : 0,
    gestureActivityPerMinute: Math.round(state.gestureEvents / minutes),
    averageShoulderTiltChangeDegrees: Math.round(mean(state.shoulderTiltTotal, state.measurementFrames) * 10) / 10,
    averageTorsoLeanChangeDegrees: Math.round(mean(state.torsoLeanTotal, state.measurementFrames) * 10) / 10,
    shoulderDepthChange: Math.round(mean(state.shoulderDepthTotal, state.measurementFrames) * 1000) / 1000,
    slouchTrendPercent: state.measurementFrames ? Math.round(state.slouchFrames / state.measurementFrames * 100) : 0,
    fidgetMovementsPerMinute: Math.round(state.fidgetEvents / minutes),
    detectionQualityPercent,
    calibrationComplete,
    baselineReady,
    lowConfidence,
  };
}
