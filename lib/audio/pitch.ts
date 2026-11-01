import type { PitchVarietyLabel } from "@/lib/audio/types";

export type PitchEstimate = {
  frequencyHz: number | null;
  confidence: number;
  voiced: boolean;
};

export type PitchSummary = {
  medianHz: number;
  rangeSemitones: number;
  variationSemitones: number;
  variety: PitchVarietyLabel;
  sampleCount: number;
};

const MIN_FREQUENCY_HZ = 70;
const MAX_FREQUENCY_HZ = 400;
const TARGET_SAMPLE_RATE = 11_025;
const MIN_VOICED_RMS = 0.002;
const MIN_CONFIDENCE = 0.5;
const MIN_PITCH_SAMPLES = 20;

function decimate(samples: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return samples;
  const length = Math.floor(samples.length / factor);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let total = 0;
    for (let offset = 0; offset < factor; offset += 1) {
      total += samples[index * factor + offset] ?? 0;
    }
    output[index] = total / factor;
  }
  return output;
}

function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < samples.length; index += 1) total += samples[index] * samples[index];
  return Math.sqrt(total / samples.length);
}

/**
 * Lightweight normalized-autocorrelation pitch estimate. The signal is decimated
 * to roughly 11 kHz first so a mid-range phone can run this every frame without
 * blocking the main thread. Only clearly periodic (voiced) frames are returned.
 */
export function estimatePitch(samples: Float32Array, sampleRate: number): PitchEstimate {
  const unvoiced: PitchEstimate = { frequencyHz: null, confidence: 0, voiced: false };
  if (samples.length < 256 || sampleRate <= 0 || rootMeanSquare(samples) < MIN_VOICED_RMS) return unvoiced;

  const factor = Math.max(1, Math.round(sampleRate / TARGET_SAMPLE_RATE));
  const signal = decimate(samples, factor);
  const effectiveRate = sampleRate / factor;
  const length = signal.length;
  if (length < 256) return unvoiced;

  let mean = 0;
  for (let index = 0; index < length; index += 1) mean += signal[index];
  mean /= length;

  const centered = new Float32Array(length);
  for (let index = 0; index < length; index += 1) centered[index] = signal[index] - mean;

  const minLag = Math.max(2, Math.floor(effectiveRate / MAX_FREQUENCY_HZ));
  const maxLag = Math.min(Math.floor(length / 2), Math.ceil(effectiveRate / MIN_FREQUENCY_HZ));
  if (maxLag <= minLag) return unvoiced;

  const correlations = new Float32Array(maxLag - minLag + 1);
  let bestLag = -1;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    for (let index = 0; index + lag < length; index += 1) {
      const current = centered[index];
      const shifted = centered[index + lag];
      correlation += current * shifted;
      energyA += current * current;
      energyB += shifted * shifted;
    }
    const denominator = Math.sqrt(energyA * energyB);
    const normalized = denominator > 0 ? correlation / denominator : 0;
    correlations[lag - minLag] = normalized;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < MIN_CONFIDENCE) return unvoiced;

  // Autocorrelation also peaks at integer multiples of the true period. Prefer
  // the first strong local peak so a 220 Hz voice is not reported as 110 Hz.
  for (let lag = minLag + 1; lag < bestLag; lag += 1) {
    const value = correlations[lag - minLag];
    const previous = correlations[lag - minLag - 1];
    const next = correlations[lag - minLag + 1];
    if (value >= bestCorrelation * 0.9 && value >= previous && value >= next) {
      bestLag = lag;
      bestCorrelation = value;
      break;
    }
  }

  // Parabolic interpolation around the best lag yields a smoother frequency trace.
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const correlationAt = (lag: number) => {
      let correlation = 0;
      let energyA = 0;
      let energyB = 0;
      for (let index = 0; index + lag < length; index += 1) {
        const current = centered[index];
        const shifted = centered[index + lag];
        correlation += current * shifted;
        energyA += current * current;
        energyB += shifted * shifted;
      }
      const denominator = Math.sqrt(energyA * energyB);
      return denominator > 0 ? correlation / denominator : 0;
    };
    const previous = correlationAt(bestLag - 1);
    const next = correlationAt(bestLag + 1);
    const denominator = previous - 2 * bestCorrelation + next;
    if (Math.abs(denominator) > 1e-9) {
      refinedLag = bestLag + (0.5 * (previous - next)) / denominator;
    }
  }

  const frequencyHz = effectiveRate / refinedLag;
  if (!Number.isFinite(frequencyHz) || frequencyHz < MIN_FREQUENCY_HZ || frequencyHz > MAX_FREQUENCY_HZ) {
    return unvoiced;
  }
  return { frequencyHz, confidence: bestCorrelation, voiced: true };
}

export function summarizePitch(values: readonly number[]): PitchSummary | null {
  const usable = values.filter((value) => Number.isFinite(value) && value >= MIN_FREQUENCY_HZ && value <= MAX_FREQUENCY_HZ);
  if (usable.length < MIN_PITCH_SAMPLES) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  const medianHz = sorted[Math.floor(sorted.length / 2)];
  const low = sorted[Math.floor((sorted.length - 1) * 0.05)];
  const high = sorted[Math.floor((sorted.length - 1) * 0.95)];
  const semitones = usable.map((value) => 12 * Math.log2(value / medianHz));
  const mean = semitones.reduce((total, value) => total + value, 0) / semitones.length;
  const variance = semitones.reduce((total, value) => total + (value - mean) ** 2, 0) / semitones.length;
  const variationSemitones = Math.sqrt(variance);
  const rangeSemitones = Math.abs(12 * Math.log2(high / Math.max(low, 1)));

  const variety: PitchVarietyLabel =
    variationSemitones < 1.2 ? "monotone" : variationSemitones < 2.5 ? "some variation" : "varied";

  return { medianHz, rangeSemitones, variationSemitones, variety, sampleCount: usable.length };
}
