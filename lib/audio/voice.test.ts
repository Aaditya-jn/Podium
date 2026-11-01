import { describe, expect, it } from "vitest";

import {
  addTranscriptSnapshot,
  addVoiceFrame,
  createVoiceAccumulator,
  getVoiceMetrics,
  pauseVoiceAccumulator,
  type VoiceAccumulator,
} from "@/lib/audio/aggregation";
import type { VoiceFrame } from "@/lib/audio/types";
import { adaptNoiseFloor, finalizeNoiseCalibration, percentile } from "@/lib/audio/calibration";
import { countFillers } from "@/lib/audio/fillers";
import { addPauseFrame, createPauseDetector, finalizePauseDetector, summarizePauses } from "@/lib/audio/pauses";
import { estimatePitch } from "@/lib/audio/pitch";
import { detectTrailingOff } from "@/lib/audio/volume";
import { DEFAULT_VOICE_SIGNALS } from "@/lib/audio/types";

function sine(frequency: number, sampleRate: number, length = 2_048, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
  }
  return samples;
}

function frame(timestamp: number, changes: Partial<VoiceFrame> = {}): VoiceFrame {
  return {
    timestamp,
    rms: 0.05,
    dbfs: -26,
    dbRelative: 0,
    isSpeech: true,
    pitchHz: 150,
    pitchConfidence: 0.9,
    calibrationComplete: true,
    noiseFloorRms: 0.005,
    speechLevelRms: 0.05,
    thresholdRms: 0.015,
    ...changes,
  };
}

function speechFrame(timestamp: number, dbRelative = 0): VoiceFrame {
  return frame(timestamp, { isSpeech: true, dbRelative });
}

function silentFrame(timestamp: number): VoiceFrame {
  return frame(timestamp, { isSpeech: false, rms: 0.004, dbfs: -48, dbRelative: -25, pitchHz: null });
}

function feed(state: VoiceAccumulator, startMs: number, endMs: number, stepMs: number, make: (timestamp: number) => VoiceFrame) {
  let next = state;
  for (let timestamp = startMs; timestamp <= endMs; timestamp += stepMs) {
    next = addVoiceFrame(next, make(timestamp));
  }
  return next;
}

describe("noise-floor calibration", () => {
  it("computes a stable threshold from a noisy baseline", () => {
    const calibration = finalizeNoiseCalibration(Array.from({ length: 50 }, () => 0.01));
    expect(calibration.complete).toBe(true);
    expect(calibration.noiseFloorRms).toBeCloseTo(0.01, 5);
    expect(calibration.thresholdRms).toBeCloseTo(0.03, 5);
    expect(calibration.speechLevelRms).toBeCloseTo(0.04, 5);
  });

  it("adapts downward while the room is quiet but never below the floor", () => {
    const calibration = finalizeNoiseCalibration(Array.from({ length: 50 }, () => 0.01));
    const adapted = adaptNoiseFloor(calibration, 0.005, false);
    expect(adapted.noiseFloorRms).toBeLessThan(calibration.noiseFloorRms);
    expect(adapted.noiseFloorRms).toBeGreaterThanOrEqual(0.0005);
    const speech = adaptNoiseFloor(adapted, 0.2, true);
    expect(speech.noiseFloorRms).toBe(adapted.noiseFloorRms);
  });

  it("computes percentiles for synthetic baselines", () => {
    expect(percentile([0, 10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });
});

describe("pause detection", () => {
  it("counts short natural pauses separately from long pauses", () => {
    let detector = createPauseDetector(true);
    for (let timestamp = 0; timestamp <= 4_000; timestamp += 100) {
      const shortSilence = timestamp >= 500 && timestamp < 1_100;
      const longSilence = timestamp >= 2_000 && timestamp < 4_100;
      detector = addPauseFrame(detector, timestamp, !(shortSilence || longSilence));
    }
    detector = finalizePauseDetector(detector);
    const summary = summarizePauses(detector);
    expect(summary.pauseCount).toBe(2);
    expect(summary.shortPauseCount).toBe(1);
    expect(summary.longPauseCount).toBe(1);
    expect(summary.longestPauseSeconds).toBeGreaterThanOrEqual(2);
    expect(summary.silentPercent).toBeGreaterThan(30);
  });

  it("does not count silences shorter than 300 ms", () => {
    let detector = createPauseDetector(true);
    for (let timestamp = 0; timestamp <= 1_000; timestamp += 100) {
      detector = addPauseFrame(detector, timestamp, !(timestamp >= 500 && timestamp < 700));
    }
    detector = finalizePauseDetector(detector);
    expect(summarizePauses(detector).pauseCount).toBe(0);
  });
});

describe("pitch estimation", () => {
  it("finds a 220 Hz sine wave", () => {
    const result = estimatePitch(sine(220, 48_000), 48_000);
    expect(result.voiced).toBe(true);
    expect(result.frequencyHz).toBeGreaterThan(215);
    expect(result.frequencyHz).toBeLessThan(225);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("finds a 140 Hz sine wave at a lower sample rate", () => {
    const result = estimatePitch(sine(140, 16_000), 16_000);
    expect(result.voiced).toBe(true);
    expect(result.frequencyHz).toBeGreaterThan(135);
    expect(result.frequencyHz).toBeLessThan(145);
  });

  it("rejects silence and white noise", () => {
    expect(estimatePitch(new Float32Array(2_048), 48_000).voiced).toBe(false);
    const noise = new Float32Array(2_048);
    let seed = 123456789;
    for (let index = 0; index < noise.length; index += 1) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      noise[index] = ((seed / 2_147_483_648) * 2 - 1) * 0.4;
    }
    expect(estimatePitch(noise, 48_000).voiced).toBe(false);
  });
});

describe("volume trailing-off detection", () => {
  it("flags a ramp that drops at the end of a run", () => {
    const samples = Array.from({ length: 21 }, (_, index) => ({
      timestamp: index * 100,
      db: index < 13 ? -10 : -10 - (index - 12) * 1.5,
    }));
    expect(detectTrailingOff(samples)).toBe(true);
  });

  it("does not flag a steady run", () => {
    const samples = Array.from({ length: 21 }, (_, index) => ({ timestamp: index * 100, db: -10 }));
    expect(detectTrailingOff(samples)).toBe(false);
  });
});

describe("filler counting", () => {
  it("counts common fillers including multi-word phrases", () => {
    const result = countFillers("Um, I like this, you know, basically actually so right, uh.");
    expect(result.total).toBe(8);
    expect(result.byFiller.um).toBe(1);
    expect(result.byFiller["you know"]).toBe(1);
    expect(result.byFiller.uh).toBe(1);
  });

  it("does not count filler-like fragments inside other words", () => {
    expect(countFillers("Someone likes rights and basics.").total).toBe(0);
  });
});

describe("voice aggregation", () => {
  it("enforces the not-enough-data rule for a short session", () => {
    let state = createVoiceAccumulator(DEFAULT_VOICE_SIGNALS);
    state = feed(state, 0, 5_000, 100, (timestamp) => speechFrame(timestamp));
    const metrics = getVoiceMetrics(state);
    expect(metrics.notEnoughData).toBe(true);
    metrics.segments.forEach((segment) => {
      expect(segment.pauseCount).toBeNull();
      expect(segment.volumeVariationDb).toBeNull();
      expect(segment.pitchVarietySemitones).toBeNull();
      expect(segment.paceWpm).toBeNull();
    });
  });

  it("computes pauses, volume, pitch, pace and fillers over a full talk", () => {
    let state = createVoiceAccumulator(DEFAULT_VOICE_SIGNALS);
    state = feed(state, 0, 12_000, 100, (timestamp) => {
      const silent = timestamp >= 4_000 && timestamp < 4_800;
      return silent ? silentFrame(timestamp) : frame(timestamp, { dbRelative: timestamp > 8_000 ? -6 : 0, pitchHz: timestamp > 8_000 ? 190 : 140 });
    });
    state = addTranscriptSnapshot(state, "one two three", 0);
    state = addTranscriptSnapshot(state, "one two three four five six seven eight nine ten eleven twelve", 4_000);
    state = addTranscriptSnapshot(
      state,
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen um you know",
      12_000,
    );
    const metrics = getVoiceMetrics(state);

    expect(metrics.notEnoughData).toBe(false);
    expect(metrics.calibrationComplete).toBe(true);
    expect(metrics.pauseCount).toBe(1);
    expect(metrics.longestPauseSeconds).toBeGreaterThanOrEqual(0.7);
    expect(metrics.silentPercent).toBeGreaterThan(5);
    expect(metrics.volumeVariationDb).toBeGreaterThan(0);
    expect(metrics.pitchMedianHz).toBeGreaterThan(100);
    expect(metrics.pitchVariety).toMatch(/monotone|some variation|varied/);
    expect(metrics.wordsPerMinute).toBeGreaterThan(0);
    expect(metrics.fillerCount).toBe(2);
    expect(metrics.fillerCountApproximate).toBe(true);
    expect(metrics.fillerRatePerMinute).toBeGreaterThan(0);
    expect(metrics.segments).toHaveLength(4);
    expect(metrics.segments[0].pauseCount).toBe(0);
    expect(metrics.segments[1].pauseCount).toBe(1);
    expect(metrics.segments.some((segment) => segment.paceFlag !== null || segment.paceWpm !== null)).toBe(true);
  });

  it("flags trailing off in a speech run that loses level", () => {
    let state = createVoiceAccumulator(DEFAULT_VOICE_SIGNALS);
    state = feed(state, 0, 2_000, 100, (timestamp) => speechFrame(timestamp, -10));
    state = feed(state, 2_100, 2_500, 100, (timestamp) => silentFrame(timestamp));
    state = feed(state, 2_600, 4_600, 100, (timestamp) => {
      const elapsed = timestamp - 2_600;
      return speechFrame(timestamp, elapsed < 1_200 ? -10 : -10 - (elapsed - 1_200) * 0.02);
    });
    state = feed(state, 4_700, 5_200, 100, (timestamp) => silentFrame(timestamp));
    state = feed(state, 5_300, 12_000, 100, (timestamp) => speechFrame(timestamp, -10));
    state = pauseVoiceAccumulator(state, 12_000);
    const metrics = getVoiceMetrics(state);
    expect(metrics.notEnoughData).toBe(false);
    expect(metrics.trailingOffCount).toBeGreaterThanOrEqual(1);
    expect(metrics.trailingOffRatio).toBeGreaterThan(0);
  });

  it("excludes paused time from the analysed duration", () => {
    let state = createVoiceAccumulator(DEFAULT_VOICE_SIGNALS);
    state = feed(state, 0, 2_000, 100, (timestamp) => speechFrame(timestamp));
    state = pauseVoiceAccumulator(state, 2_000);
    state = addVoiceFrame(state, speechFrame(65_000));
    state = addVoiceFrame(state, speechFrame(65_100));
    expect(getVoiceMetrics(state).analyzedSeconds).toBeCloseTo(2.1, 1);
  });

  it("honours per-signal opt-outs", () => {
    let state = createVoiceAccumulator({ ...DEFAULT_VOICE_SIGNALS, pitch: false, fillers: false, pauses: false });
    state = feed(state, 0, 12_000, 100, (timestamp) => speechFrame(timestamp));
    state = addTranscriptSnapshot(state, "um one two three four five six seven eight nine ten", 12_000);
    const metrics = getVoiceMetrics(state);
    expect(metrics.pauseCount).toBeNull();
    expect(metrics.pitchMedianHz).toBeNull();
    expect(metrics.pitchVariety).toBeNull();
    expect(metrics.fillerCount).toBeNull();
    expect(metrics.fillerRatePerMinute).toBeNull();
    expect(metrics.wordsPerMinute).not.toBeNull();
    metrics.segments.forEach((segment) => {
      expect(segment.pauseCount).toBeNull();
      expect(segment.pitchVarietySemitones).toBeNull();
      expect(segment.fillerCount).toBeNull();
    });
  });
});
