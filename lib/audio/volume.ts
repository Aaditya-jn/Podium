import { rmsToDbfs } from "@/lib/audio/calibration";

export type VolumeSample = { timestamp: number; db: number };

export type VolumeSummary = {
  meanDbRelative: number;
  variationDb: number;
  trailingOffCount: number;
  trailingOffRatio: number;
  speechRunCount: number;
};

const TRAILING_OFF_WINDOW_MS = 800;
const TRAILING_OFF_DROP_DB = 3;
const MIN_RUN_MS = 1_500;

export function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < samples.length; index += 1) total += samples[index] * samples[index];
  return Math.sqrt(total / samples.length);
}

export function relativeDb(rms: number, baselineRms: number): number {
  return rmsToDbfs(rms) - rmsToDbfs(Math.max(baselineRms, 1e-8));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * A run "trails off" when its final 800 ms sit at least 3 dB below the opening
 * portion of the same run. This is descriptive: it says the level dropped, not
 * why the speaker did it.
 */
export function detectTrailingOff(samples: readonly VolumeSample[]): boolean {
  if (samples.length < 6) return false;
  const start = samples[0].timestamp;
  const end = samples[samples.length - 1].timestamp;
  if (end - start < MIN_RUN_MS) return false;

  const opening = samples.filter((sample) => sample.timestamp <= start + (end - start) * 0.4);
  const closing = samples.filter((sample) => sample.timestamp >= end - TRAILING_OFF_WINDOW_MS);
  if (opening.length < 3 || closing.length < 3) return false;

  return mean(opening.map((sample) => sample.db)) - mean(closing.map((sample) => sample.db)) >= TRAILING_OFF_DROP_DB;
}

export function summarizeVolume(input: {
  dbSum: number;
  dbSquaredSum: number;
  dbCount: number;
  speechRunCount: number;
  trailingOffCount: number;
}): VolumeSummary {
  if (input.dbCount === 0) {
    return { meanDbRelative: 0, variationDb: 0, trailingOffCount: 0, trailingOffRatio: 0, speechRunCount: 0 };
  }
  const average = input.dbSum / input.dbCount;
  const variance = Math.max(0, input.dbSquaredSum / input.dbCount - average * average);
  return {
    meanDbRelative: average,
    variationDb: Math.sqrt(variance),
    trailingOffCount: input.trailingOffCount,
    trailingOffRatio: input.speechRunCount > 0 ? input.trailingOffCount / input.speechRunCount : 0,
    speechRunCount: input.speechRunCount,
  };
}
