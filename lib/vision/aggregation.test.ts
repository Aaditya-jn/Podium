import { describe, expect, it } from "vitest";

import {
  addGesturePostureSample,
  createGesturePostureAccumulator,
  getGesturePostureMetrics,
  pauseGesturePostureAccumulator,
} from "@/lib/vision/aggregation";
import type { VisionSample } from "@/lib/vision/types";

function sample(timestamp: number, changes: Partial<VisionSample> = {}): VisionSample {
  return {
    timestamp,
    facePresent: true,
    handsPresent: false,
    handConfidence: 0,
    handDeltaX: 0,
    handDeltaY: 0,
    shoulderTiltDegrees: 5,
    torsoLeanDegrees: 2,
    shoulderDepth: 0.1,
    poseConfidence: 0.9,
    ...changes,
  };
}

function calibrate(startedAt: number, poseConfidence = 0.9) {
  let state = createGesturePostureAccumulator(startedAt);
  for (let offset = 0; offset <= 3_000; offset += 100) {
    state = addGesturePostureSample(state, sample(startedAt + offset, { poseConfidence }));
  }
  return state;
}

describe("gesture and posture aggregation", () => {
  it("calibrates from the first three seconds and aggregates movement relative to that baseline", () => {
    let state = calibrate(0);
    expect(getGesturePostureMetrics(state).baselineReady).toBe(true);

    const measurements: Partial<VisionSample>[] = [
      { handsPresent: true, handConfidence: 0.9, handDeltaX: 0.04, shoulderTiltDegrees: 15, torsoLeanDegrees: 12, shoulderDepth: 0.2 },
      { handsPresent: true, handConfidence: 0.9, handDeltaX: 0.04, shoulderTiltDegrees: 15, torsoLeanDegrees: 12, shoulderDepth: 0.2, facePresent: false },
      { handsPresent: false, handConfidence: 0, shoulderTiltDegrees: 15, torsoLeanDegrees: 12, shoulderDepth: 0.2 },
      { handsPresent: true, handConfidence: 0.9, handDeltaX: 0.04, shoulderTiltDegrees: 15, torsoLeanDegrees: 12, shoulderDepth: 0.2 },
      { handsPresent: true, handConfidence: 0.9, handDeltaX: 0.01, shoulderTiltDegrees: 15, torsoLeanDegrees: 12, shoulderDepth: 0.2 },
      { handsPresent: true, handConfidence: 0.9, handDeltaX: -0.01, shoulderTiltDegrees: 15, torsoLeanDegrees: 12, shoulderDepth: 0.2 },
    ];
    measurements.forEach((changes, index) => {
      state = addGesturePostureSample(state, sample(3_100 + index * 100, changes));
    });

    const metrics = getGesturePostureMetrics(state);
    expect(metrics.facePresencePercent).toBe(83);
    expect(metrics.handsInFramePercent).toBe(83);
    expect(metrics.gestureActivityPerMinute).toBeGreaterThan(0);
    expect(metrics.averageShoulderTiltChangeDegrees).toBe(10);
    expect(metrics.averageTorsoLeanChangeDegrees).toBe(10);
    expect(metrics.slouchTrendPercent).toBe(100);
    expect(metrics.fidgetMovementsPerMinute).toBeGreaterThan(0);
    expect(metrics.lowConfidence).toBe(false);
  });

  it("marks relative measurements as unreliable when the calibration period has poor visibility", () => {
    let state = calibrate(0, 0.1);
    for (let offset = 3_100; offset <= 4_000; offset += 100) {
      state = addGesturePostureSample(state, sample(offset, { poseConfidence: 0.2 }));
    }
    const metrics = getGesturePostureMetrics(state);
    expect(metrics.baselineReady).toBe(false);
    expect(metrics.lowConfidence).toBe(true);
  });

  it("excludes paused time from the active delivery duration", () => {
    let state = calibrate(0);
    for (let offset = 3_100; offset <= 5_000; offset += 100) state = addGesturePostureSample(state, sample(offset));
    state = pauseGesturePostureAccumulator(state, 5_000);
    state = addGesturePostureSample(state, sample(65_000));
    state = addGesturePostureSample(state, sample(66_000));
    expect(getGesturePostureMetrics(state).durationSeconds).toBe(3);
  });
});
