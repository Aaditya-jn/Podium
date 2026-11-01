// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import DeliveryInsightsView from "@/components/delivery-insights-view";
import type { VoiceMetrics } from "@/lib/audio/types";
import type { GesturePostureMetrics } from "@/lib/vision/aggregation";

const voice: VoiceMetrics = {
  durationSeconds: 60,
  analyzedSeconds: 57.5,
  calibrationComplete: true,
  noiseFloorDbfs: -47,
  speechLevelDbfs: -21,
  speechToNoiseDb: 26,
  tooQuiet: false,
  lowConfidence: false,
  notEnoughData: false,
  signals: { pauses: true, volume: true, pitch: true, pace: true, fillers: true },
  pauseCount: 6,
  shortPauseCount: 4,
  longPauseCount: 1,
  averagePauseSeconds: 0.9,
  longestPauseSeconds: 4.1,
  silentPercent: 18,
  meanVolumeDbRelative: -2.1,
  volumeVariationDb: 6.2,
  trailingOffCount: 2,
  trailingOffRatio: 33,
  pitchMedianHz: 165,
  pitchRangeSemitones: 8.4,
  pitchVariationSemitones: 2.1,
  pitchVariety: "some variation",
  voicedFramePercent: 62,
  wordsPerMinute: 148,
  speechActivityPercent: 72,
  paceTrend: "faster",
  fillerCount: 9,
  fillerRatePerMinute: 9.4,
  fillerCountApproximate: true,
  segments: Array.from({ length: 4 }, (_, index) => ({
    label: `Part ${index + 1}`,
    analyzedSeconds: 14.4,
    pauseCount: 1,
    shortPauseCount: 1,
    longPauseCount: 0,
    silentPercent: 12,
    meanVolumeDbRelative: -2,
    volumeVariationDb: 5,
    trailingOffCount: 0,
    pitchVarietySemitones: 2,
    pitchMedianHz: 160,
    paceWpm: 140 + index * 5,
    paceFlag: index === 3 ? "faster" : null,
    speechActivityPercent: 72,
    fillerCount: 2,
    fillerRatePerMinute: 8,
  })),
};

const camera: GesturePostureMetrics = {
  durationSeconds: 57,
  facePresencePercent: 98,
  gazeTowardCameraPercent: 62,
  headStabilityPercent: 84,
  browMovementVariety: 35,
  smileFrequencyPerMinute: 4,
  mouthActivity: 110,
  blinkRatePerMinute: 18,
  detectionQualityPercent: 90,
  calibrationComplete: true,
  baselineReady: true,
  lowConfidence: false,
  notEnoughData: false,
  segments: Array.from({ length: 4 }, (_, index) => ({
    label: `Part ${index + 1}`,
    faceVisibilityPercent: 100,
    gazeTowardCameraPercent: 70 - index * 5,
    headStabilityPercent: 88,
    browMovementVariety: 30,
    smileFrequencyPerMinute: 4,
    mouthActivity: 110,
    blinkRatePerMinute: 18,
  })),
};

afterEach(cleanup);

describe("DeliveryInsightsView", () => {
  it("renders voice metrics and the fused camera/voice timeline", () => {
    render(<DeliveryInsightsView metrics={camera} voice={voice} />);
    expect(screen.getByText("Voice signals")).toBeTruthy();
    expect(screen.getByText("Camera signals")).toBeTruthy();
    expect(screen.getAllByText("Pauses").length).toBeGreaterThan(0);
    expect(screen.getByText(/Filler words/)).toBeTruthy();
    expect(screen.getAllByText("Gaze toward lens").length).toBe(4);
    expect(screen.getAllByText("Pauses").length).toBeGreaterThan(1);
    expect(screen.getByText(/never claim emotion/)).toBeTruthy();
  });

  it("shows Not enough data for a short voice session", () => {
    render(<DeliveryInsightsView voice={{ ...voice, notEnoughData: true }} />);
    expect(screen.getByText("Not enough data")).toBeTruthy();
    expect(screen.getByText(/at least 8 seconds of analysable speech/)).toBeTruthy();
  });
});
