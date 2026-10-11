import { describe, expect, it } from "vitest";

import {
  addGesturePostureSample,
  createGesturePostureAccumulator,
  getGesturePostureMetrics,
  pauseGesturePostureAccumulator,
  SEGMENT_COUNT,
} from "@/lib/vision/aggregation";
import type { VisionSample } from "@/lib/vision/types";

function sample(timestamp: number, changes: Partial<VisionSample> = {}): VisionSample {
  return {
    timestamp,
    facePresent: true,
    faceConfidence: 0.9,
    eyeDirection: 0.05,
    headYaw: 0.02,
    headPitch: 0.01,
    headRoll: 0.01,
    browMovement: 0.1,
    smileAmount: 0.05,
    mouthActivity: 0.1,
    blinkAmount: 0.05,
    ...changes,
  };
}

function calibrate(startedAt = 0, faceConfidence = 0.9) {
  let state = createGesturePostureAccumulator(startedAt);
  for (let offset = 0; offset <= 3_000; offset += 100) {
    state = addGesturePostureSample(state, sample(startedAt + offset, { faceConfidence }));
  }
  return state;
}

describe("descriptive camera signal aggregation", () => {
  it("calibrates baseline from the user's first 3 seconds", () => {
    let state = createGesturePostureAccumulator(0);
    // Before 3000ms
    for (let offset = 0; offset < 2_500; offset += 100) {
      state = addGesturePostureSample(state, sample(offset, { headYaw: 0.04 }));
    }
    let metrics = getGesturePostureMetrics(state);
    expect(metrics.calibrationComplete).toBe(false);
    expect(metrics.baselineReady).toBe(false);

    // Cross the 3-second boundary
    for (let offset = 2_500; offset <= 3_000; offset += 100) {
      state = addGesturePostureSample(state, sample(offset, { headYaw: 0.04 }));
    }
    metrics = getGesturePostureMetrics(state);
    expect(metrics.calibrationComplete).toBe(true);
    expect(metrics.baselineReady).toBe(true);
    expect(state.baseline).not.toBeNull();
    expect(state.baseline?.headYaw).toBeCloseTo(0.04);
  });

  it("computes descriptive signals and divides talk into segments", () => {
    let state = calibrate(0);

    // Add 10 seconds of active delivery (from 3100ms to 13000ms)
    for (let offset = 3_100; offset <= 13_000; offset += 100) {
      const isSecondHalf = offset > 8_000;
      state = addGesturePostureSample(state, sample(offset, {
        eyeDirection: isSecondHalf ? 0.35 : 0.05, // gaze drops away from camera in second half
        headYaw: 0.02,
        browMovement: 0.2,
        smileAmount: offset % 2000 < 200 ? 0.35 : 0.05, // occasional smile pulses
        mouthActivity: 0.25,
        blinkAmount: offset % 1500 < 100 ? 0.8 : 0.05, // occasional blinks
      }));
    }

    const metrics = getGesturePostureMetrics(state);
    expect(metrics.notEnoughData).toBe(false);
    expect(metrics.durationSeconds).toBe(10);
    expect(metrics.facePresencePercent).toBe(100);
    expect(metrics.gazeTowardCameraPercent).toBeGreaterThan(40);
    expect(metrics.headStabilityPercent).toBeGreaterThan(80);
    expect(metrics.browMovementVariety).toBeGreaterThan(0);
    expect(metrics.mouthActivity).toBeGreaterThan(0);
    expect(metrics.smileFrequencyPerMinute).toBeGreaterThanOrEqual(0);
    expect(metrics.blinkRatePerMinute).toBeGreaterThanOrEqual(0);

    // Segments timeline
    expect(metrics.segments).toHaveLength(SEGMENT_COUNT);
    expect(metrics.segments[0].label).toBe("Part 1");
    expect(metrics.segments[0].gazeTowardCameraPercent).toBe(100);
    expect(metrics.segments[3].label).toBe("Part 4");
    expect(metrics.segments[3].gazeTowardCameraPercent).toBeLessThan(50);
  });

  it("enforces the not-enough-data rule when session duration is shorter than minimum", () => {
    let state = calibrate(0);
    // Only 4 seconds after baseline (less than MINIMUM_DELIVERY_SECONDS = 8)
    for (let offset = 3_100; offset <= 7_000; offset += 100) {
      state = addGesturePostureSample(state, sample(offset));
    }
    const metrics = getGesturePostureMetrics(state);
    expect(metrics.durationSeconds).toBe(4);
    expect(metrics.notEnoughData).toBe(true);
    // Segments must have null metrics when there is not enough data
    metrics.segments.forEach((seg) => {
      expect(seg.gazeTowardCameraPercent).toBeNull();
      expect(seg.headStabilityPercent).toBeNull();
      expect(seg.faceVisibilityPercent).toBeNull();
    });
  });

  it("enforces the not-enough-data rule when calibration period has poor visibility", () => {
    // Face confidence is below 0.35 during calibration
    let state = calibrate(0, 0.1);
    for (let offset = 3_100; offset <= 12_000; offset += 100) {
      state = addGesturePostureSample(state, sample(offset, { faceConfidence: 0.1 }));
    }
    const metrics = getGesturePostureMetrics(state);
    expect(metrics.baselineReady).toBe(false);
    expect(metrics.lowConfidence).toBe(true);
    expect(metrics.notEnoughData).toBe(true);
  });

  it("excludes paused time from active delivery duration", () => {
    let state = calibrate(0);
    for (let offset = 3_100; offset <= 5_000; offset += 100) {
      state = addGesturePostureSample(state, sample(offset));
    }
    state = pauseGesturePostureAccumulator(state, 5_000);
    // Paused for 60 seconds
    state = addGesturePostureSample(state, sample(65_000));
    state = addGesturePostureSample(state, sample(66_000));
    expect(getGesturePostureMetrics(state).durationSeconds).toBe(3);
  });
});
