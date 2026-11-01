import { VOICE_CALIBRATION_MS } from "@/lib/audio/types";

export type CalibrationState = {
  startedAt: number | null;
  complete: boolean;
  /** Raw RMS values gathered during the calibration window (bounded). */
  values: number[];
  noiseFloorRms: number;
  speechLevelRms: number;
  thresholdRms: number;
  adapted: boolean;
};

const MIN_NOISE_FLOOR_RMS = 0.0005;
const MIN_THRESHOLD_RMS = 0.0015;

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function rmsToDbfs(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-8));
}

export function createNoiseCalibration(): CalibrationState {
  return {
    startedAt: null,
    complete: false,
    values: [],
    noiseFloorRms: MIN_NOISE_FLOOR_RMS,
    speechLevelRms: MIN_NOISE_FLOOR_RMS,
    thresholdRms: MIN_THRESHOLD_RMS,
    adapted: false,
  };
}

/**
 * Finalizes a calibration window. The noise floor uses a low percentile so brief
 * quiet gaps inside the window are not mistaken for continuous background noise.
 */
export function finalizeNoiseCalibration(values: readonly number[], adapted = false): CalibrationState {
  const noiseFloorRms = Math.max(MIN_NOISE_FLOOR_RMS, percentile(values, 0.2));
  const speechLevelRms = Math.max(noiseFloorRms * 4, percentile(values, 0.9));
  return {
    startedAt: null,
    complete: true,
    values: [],
    noiseFloorRms,
    speechLevelRms,
    thresholdRms: Math.max(MIN_THRESHOLD_RMS, noiseFloorRms * 3),
    adapted,
  };
}

export function addCalibrationSample(state: CalibrationState, rms: number, timestamp: number): CalibrationState {
  if (state.complete) return state;
  const startedAt = state.startedAt ?? timestamp;
  const values = state.values.length >= 400 ? state.values : [...state.values, rms];
  if (timestamp - startedAt >= VOICE_CALIBRATION_MS && values.length >= 10) {
    return { ...finalizeNoiseCalibration(values), startedAt };
  }
  return { ...state, startedAt, values };
}

/**
 * Slowly follows a changing room noise floor while the speaker is quiet.
 * It never lowers the threshold enough for steady background noise to read as speech.
 */
export function adaptNoiseFloor(state: CalibrationState, rms: number, isSpeech: boolean): CalibrationState {
  if (!state.complete) return state;
  const quiet = !isSpeech && rms < state.thresholdRms;
  if (!quiet) return state;
  const noiseFloorRms = Math.max(
    MIN_NOISE_FLOOR_RMS,
    Math.min(state.noiseFloorRms * 1.5, state.noiseFloorRms * 0.97 + rms * 0.03),
  );
  return {
    ...state,
    noiseFloorRms,
    thresholdRms: Math.max(MIN_THRESHOLD_RMS, noiseFloorRms * 3),
    adapted: true,
  };
}

export function calibrationQuality(state: CalibrationState): number {
  if (!state.complete) return 0;
  return state.speechLevelRms / Math.max(state.noiseFloorRms, MIN_NOISE_FLOOR_RMS);
}
