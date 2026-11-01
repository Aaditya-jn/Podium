import { rmsToDbfs } from "@/lib/audio/calibration";
import { countFillers, countWords } from "@/lib/audio/fillers";
import { createPauseDetector, addPauseFrame, finalizePauseDetector, summarizePauses, type PauseDetectorState } from "@/lib/audio/pauses";
import { summarizePitch } from "@/lib/audio/pitch";
import { detectTrailingOff, summarizeVolume, type VolumeSample } from "@/lib/audio/volume";
import {
  LONG_PAUSE_MIN_MS,
  MIN_SPEECH_TO_NOISE_DB,
  MIN_VOICE_SECONDS,
  SHORT_PAUSE_MAX_MS,
  VOICE_SEGMENT_COUNT,
  type PaceTrend,
  type SegmentedPaceFlag,
  type VoiceFrame,
  type VoiceMetrics,
  type VoiceSegment,
  type VoiceSignalToggles,
} from "@/lib/audio/types";

type SpeechRun = { startedAt: number; samples: VolumeSample[] };

type VoiceBucket = {
  analyzedSeconds: number;
  silentSeconds: number;
  speechSeconds: number;
  frames: number;
  speechFrames: number;
  pauseCount: number;
  shortPauseCount: number;
  longPauseCount: number;
  pauseSeconds: number;
  longestPauseSeconds: number;
  dbSum: number;
  dbSquaredSum: number;
  dbCount: number;
  trailingOffCount: number;
  speechRunCount: number;
  pitchValues: number[];
  voicedFrames: number;
};

type TranscriptSnapshot = {
  elapsedSeconds: number;
  wordCount: number;
  fillerCount: number;
};

export type VoiceAccumulator = {
  signals: VoiceSignalToggles;
  startedAt: number | null;
  lastTimestamp: number;
  pausedAt: number | null;
  frameCount: number;
  voicedFrames: number;
  speechSeconds: number;
  calibrationComplete: boolean;
  noiseFloorRms: number;
  speechLevelRms: number;
  thresholdRms: number;
  pauses: PauseDetectorState;
  speechRun: SpeechRun | null;
  speechRunCount: number;
  trailingOffCount: number;
  dbSum: number;
  dbSquaredSum: number;
  dbCount: number;
  pitchValues: number[];
  transcript: TranscriptSnapshot[];
  buckets: Record<number, VoiceBucket>;
};

const MAX_PITCH_SAMPLES = 20_000;
const MAX_BUCKET_PITCH_SAMPLES = 2_000;
const MAX_TRANSCRIPT_SNAPSHOTS = 400;

function emptyBucket(): VoiceBucket {
  return {
    analyzedSeconds: 0,
    silentSeconds: 0,
    speechSeconds: 0,
    frames: 0,
    speechFrames: 0,
    pauseCount: 0,
    shortPauseCount: 0,
    longPauseCount: 0,
    pauseSeconds: 0,
    longestPauseSeconds: 0,
    dbSum: 0,
    dbSquaredSum: 0,
    dbCount: 0,
    trailingOffCount: 0,
    speechRunCount: 0,
    pitchValues: [],
    voicedFrames: 0,
  };
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createVoiceAccumulator(signals: VoiceSignalToggles): VoiceAccumulator {
  return {
    signals,
    startedAt: null,
    lastTimestamp: 0,
    pausedAt: null,
    frameCount: 0,
    voicedFrames: 0,
    speechSeconds: 0,
    calibrationComplete: false,
    noiseFloorRms: 0,
    speechLevelRms: 0,
    thresholdRms: 0,
    pauses: createPauseDetector(signals.pauses),
    speechRun: null,
    speechRunCount: 0,
    trailingOffCount: 0,
    dbSum: 0,
    dbSquaredSum: 0,
    dbCount: 0,
    pitchValues: [],
    transcript: [],
    buckets: {},
  };
}

function bucketAt(buckets: Record<number, VoiceBucket>, elapsedSeconds: number): { key: number; bucket: VoiceBucket } {
  const key = Math.max(0, Math.floor(elapsedSeconds));
  return { key, bucket: buckets[key] ?? emptyBucket() };
}

function closeSpeechRun(state: VoiceAccumulator, elapsedSeconds: number): VoiceAccumulator {
  const run = state.speechRun;
  if (!run) return state;
  const durationMs = (elapsedSeconds - run.startedAt) * 1_000;
  if (durationMs < 1_500) return { ...state, speechRun: null };

  const trailing = state.signals.volume && detectTrailingOff(run.samples);
  const location = bucketAt(state.buckets, elapsedSeconds);
  const bucket = {
    ...location.bucket,
    speechRunCount: location.bucket.speechRunCount + 1,
    trailingOffCount: location.bucket.trailingOffCount + (trailing ? 1 : 0),
  };
  return {
    ...state,
    speechRun: null,
    speechRunCount: state.speechRunCount + 1,
    trailingOffCount: state.trailingOffCount + (trailing ? 1 : 0),
    buckets: { ...state.buckets, [location.key]: bucket },
  };
}

function applyPauseEvents(
  state: VoiceAccumulator,
  nextPauses: PauseDetectorState,
  elapsedSeconds: number,
  previousPauseCount: number,
): VoiceAccumulator {
  const added = nextPauses.pauses.length - previousPauseCount;
  if (added <= 0) return { ...state, pauses: nextPauses };

  let buckets = state.buckets;
  for (const pause of nextPauses.pauses.slice(-added)) {
    const location = bucketAt(buckets, elapsedSeconds);
    const durationMs = pause.durationSeconds * 1_000;
    buckets = {
      ...buckets,
      [location.key]: {
        ...location.bucket,
        pauseCount: location.bucket.pauseCount + 1,
        shortPauseCount: location.bucket.shortPauseCount + (durationMs <= SHORT_PAUSE_MAX_MS ? 1 : 0),
        longPauseCount: location.bucket.longPauseCount + (durationMs > LONG_PAUSE_MIN_MS ? 1 : 0),
        pauseSeconds: location.bucket.pauseSeconds + pause.durationSeconds,
        longestPauseSeconds: Math.max(location.bucket.longestPauseSeconds, pause.durationSeconds),
      },
    };
  }
  return { ...state, pauses: nextPauses, buckets };
}

/**
 * Adds one analyser frame. Frames from the calibration window are intentionally
 * discarded so every reported number is relative to the user's own baseline.
 */
export function addVoiceFrame(state: VoiceAccumulator, frame: VoiceFrame): VoiceAccumulator {
  let next = state;

  if (next.pausedAt !== null) {
    const shift = Math.max(0, frame.timestamp - next.pausedAt);
    next = {
      ...next,
      startedAt: next.startedAt === null ? null : next.startedAt + shift,
      lastTimestamp: next.lastTimestamp + shift,
      pausedAt: null,
      pauses: { ...next.pauses, previousTimestamp: null, silenceStartedAt: null },
    };
  }

  if (!frame.calibrationComplete) return next;

  if (next.startedAt === null) {
    next = {
      ...next,
      startedAt: frame.timestamp,
      lastTimestamp: frame.timestamp,
      calibrationComplete: true,
      noiseFloorRms: frame.noiseFloorRms,
      speechLevelRms: frame.speechLevelRms,
      thresholdRms: frame.thresholdRms,
    };
  }

  const elapsedSeconds = Math.max(0, (frame.timestamp - (next.startedAt ?? frame.timestamp)) / 1_000);
  const deltaSeconds = clamp((frame.timestamp - next.lastTimestamp) / 1_000, 0, 0.25);
  const location = bucketAt(next.buckets, elapsedSeconds);
  const bucket = { ...location.bucket, pitchValues: [...location.bucket.pitchValues] };
  const previousPauseCount = next.pauses.pauses.length;

  bucket.frames += 1;
  bucket.analyzedSeconds += deltaSeconds;

  const pauses = addPauseFrame(next.pauses, frame.timestamp, frame.isSpeech);
  next = {
    ...next,
    frameCount: next.frameCount + 1,
    lastTimestamp: frame.timestamp,
    calibrationComplete: true,
    noiseFloorRms: frame.noiseFloorRms,
    speechLevelRms: frame.speechLevelRms,
    thresholdRms: frame.thresholdRms,
  };

  if (frame.isSpeech) {
    next = { ...next, speechSeconds: next.speechSeconds + deltaSeconds };
    bucket.speechSeconds += deltaSeconds;
    bucket.speechFrames += 1;

    const run = next.speechRun ?? { startedAt: elapsedSeconds, samples: [] };
    if (next.speechRun === null) next = { ...next, speechRun: run };
    if (next.signals.volume) {
      const samples = [...run.samples, { timestamp: elapsedSeconds * 1_000, db: frame.dbRelative }];
      next = { ...next, speechRun: { ...run, samples: samples.length > 3_000 ? samples.slice(-3_000) : samples } };
      next = {
        ...next,
        dbSum: next.dbSum + frame.dbRelative,
        dbSquaredSum: next.dbSquaredSum + frame.dbRelative ** 2,
        dbCount: next.dbCount + 1,
      };
      bucket.dbSum += frame.dbRelative;
      bucket.dbSquaredSum += frame.dbRelative ** 2;
      bucket.dbCount += 1;
    }
  } else {
    bucket.silentSeconds += deltaSeconds;
  }

  const shouldCloseSpeechRun = !frame.isSpeech && next.speechRun !== null;

  if (next.signals.pitch && frame.pitchHz !== null) {
    next = {
      ...next,
      voicedFrames: next.voicedFrames + 1,
      pitchValues:
        next.pitchValues.length >= MAX_PITCH_SAMPLES
          ? next.pitchValues
          : [...next.pitchValues, frame.pitchHz],
    };
    bucket.voicedFrames += 1;
    if (bucket.pitchValues.length < MAX_BUCKET_PITCH_SAMPLES) bucket.pitchValues.push(frame.pitchHz);
  }

  next = { ...next, buckets: { ...next.buckets, [location.key]: bucket } };
  if (shouldCloseSpeechRun) next = closeSpeechRun(next, elapsedSeconds);
  return applyPauseEvents(next, pauses, elapsedSeconds, previousPauseCount);
}

export function pauseVoiceAccumulator(state: VoiceAccumulator, timestamp: number): VoiceAccumulator {
  if (state.pausedAt !== null) return state;
  const elapsedSeconds = state.startedAt === null ? 0 : Math.max(0, (timestamp - state.startedAt) / 1_000);
  let next = closeSpeechRun(state, elapsedSeconds);
  next = { ...next, pauses: finalizePauseDetector(next.pauses) };
  return { ...next, pausedAt: timestamp };
}

export function addTranscriptSnapshot(state: VoiceAccumulator, text: string, timestamp: number): VoiceAccumulator {
  const wordCount = countWords(text);
  const fillerCount = countFillers(text).total;
  const previous = state.transcript[state.transcript.length - 1];
  if (previous && previous.wordCount === wordCount && previous.fillerCount === fillerCount) return state;
  const elapsedSeconds = state.startedAt === null ? 0 : Math.max(0, (timestamp - state.startedAt) / 1_000);
  return {
    ...state,
    transcript: [...state.transcript, { elapsedSeconds, wordCount, fillerCount }].slice(-MAX_TRANSCRIPT_SNAPSHOTS),
  };
}

function countsAt(snapshots: readonly TranscriptSnapshot[], seconds: number) {
  let wordCount = 0;
  let fillerCount = 0;
  for (const snapshot of snapshots) {
    if (snapshot.elapsedSeconds > seconds) break;
    wordCount = snapshot.wordCount;
    fillerCount = snapshot.fillerCount;
  }
  return { wordCount, fillerCount };
}

function emptySegments(analyzedSeconds: number): VoiceSegment[] {
  return Array.from({ length: VOICE_SEGMENT_COUNT }, (_, index) => ({
    label: `Part ${index + 1}`,
    analyzedSeconds: round(analyzedSeconds / VOICE_SEGMENT_COUNT, 1),
    pauseCount: null,
    shortPauseCount: null,
    longPauseCount: null,
    silentPercent: null,
    meanVolumeDbRelative: null,
    volumeVariationDb: null,
    trailingOffCount: null,
    pitchVarietySemitones: null,
    pitchMedianHz: null,
    paceWpm: null,
    paceFlag: null,
    speechActivityPercent: null,
    fillerCount: null,
    fillerRatePerMinute: null,
  }));
}

function paceFlagFor(pace: number | null, median: number | null): SegmentedPaceFlag {
  if (pace === null || median === null || median <= 0) return null;
  if (pace > median * 1.25) return "faster";
  if (pace < median * 0.75) return "slower";
  return null;
}

function buildSegments(state: VoiceAccumulator, analyzedSeconds: number): VoiceSegment[] {
  const groups = Array.from({ length: VOICE_SEGMENT_COUNT }, () => emptyBucket());
  for (const [key, bucket] of Object.entries(state.buckets)) {
    const index = analyzedSeconds > 0
      ? Math.min(VOICE_SEGMENT_COUNT - 1, Math.floor((Number(key) / analyzedSeconds) * VOICE_SEGMENT_COUNT))
      : 0;
    const group = groups[index];
    group.analyzedSeconds += bucket.analyzedSeconds;
    group.silentSeconds += bucket.silentSeconds;
    group.speechSeconds += bucket.speechSeconds;
    group.frames += bucket.frames;
    group.speechFrames += bucket.speechFrames;
    group.pauseCount += bucket.pauseCount;
    group.shortPauseCount += bucket.shortPauseCount;
    group.longPauseCount += bucket.longPauseCount;
    group.pauseSeconds += bucket.pauseSeconds;
    group.longestPauseSeconds = Math.max(group.longestPauseSeconds, bucket.longestPauseSeconds);
    group.dbSum += bucket.dbSum;
    group.dbSquaredSum += bucket.dbSquaredSum;
    group.dbCount += bucket.dbCount;
    group.trailingOffCount += bucket.trailingOffCount;
    group.speechRunCount += bucket.speechRunCount;
    group.voicedFrames += bucket.voicedFrames;
    if (group.pitchValues.length < MAX_BUCKET_PITCH_SAMPLES) {
      group.pitchValues.push(...bucket.pitchValues.slice(0, MAX_BUCKET_PITCH_SAMPLES - group.pitchValues.length));
    }
  }

  const segmentSeconds = analyzedSeconds / VOICE_SEGMENT_COUNT;
  const base = groups.map((group, index) => {
    const start = index * segmentSeconds;
    const end = start + segmentSeconds;
    const words = countsAt(state.transcript, end).wordCount - countsAt(state.transcript, start).wordCount;
    const fillers = countsAt(state.transcript, end).fillerCount - countsAt(state.transcript, start).fillerCount;
    const observedSeconds = Math.max(group.analyzedSeconds, 0.001);
    const hasTranscript = state.transcript.length > 0;
    const pitch = summarizePitch(group.pitchValues);
    const volume = summarizeVolume({
      dbSum: group.dbSum,
      dbSquaredSum: group.dbSquaredSum,
      dbCount: group.dbCount,
      speechRunCount: group.speechRunCount,
      trailingOffCount: group.trailingOffCount,
    });
    const pace = state.signals.pace && hasTranscript && group.speechSeconds >= 0.5
      ? round(Math.max(0, words) / (group.speechSeconds / 60))
      : null;
    return {
      label: `Part ${index + 1}`,
      analyzedSeconds: round(observedSeconds, 1),
      paceWpm: pace,
      paceFlag: null,
      pauseCount: state.signals.pauses ? group.pauseCount : null,
      shortPauseCount: state.signals.pauses ? group.shortPauseCount : null,
      longPauseCount: state.signals.pauses ? group.longPauseCount : null,
      silentPercent: state.signals.pauses ? round(clamp(group.silentSeconds / observedSeconds * 100, 0, 100)) : null,
      meanVolumeDbRelative: state.signals.volume && group.dbCount ? round(volume.meanDbRelative, 1) : null,
      volumeVariationDb: state.signals.volume && group.dbCount ? round(volume.variationDb, 1) : null,
      trailingOffCount: state.signals.volume ? volume.trailingOffCount : null,
      pitchVarietySemitones: state.signals.pitch && pitch ? round(pitch.variationSemitones, 1) : null,
      pitchMedianHz: state.signals.pitch && pitch ? round(pitch.medianHz) : null,
      speechActivityPercent: round(clamp(group.speechSeconds / observedSeconds * 100, 0, 100)),
      fillerCount: state.signals.fillers && hasTranscript ? Math.max(0, fillers) : null,
      fillerRatePerMinute: state.signals.fillers && hasTranscript && observedSeconds > 0
        ? round(Math.max(0, fillers) / (observedSeconds / 60), 1)
        : null,
    } satisfies VoiceSegment;
  });

  const paces = base.map((segment) => segment.paceWpm).filter((pace): pace is number => pace !== null);
  const sortedPaces = [...paces].sort((a, b) => a - b);
  const medianPace = sortedPaces.length ? sortedPaces[Math.floor(sortedPaces.length / 2)] : null;

  return base.map((segment) => ({ ...segment, paceFlag: paceFlagFor(segment.paceWpm, medianPace) }));
}

function paceTrendFrom(segments: readonly VoiceSegment[]): PaceTrend | null {
  const paces = segments.map((segment) => segment.paceWpm);
  const first = paces.find((pace) => pace !== null) ?? null;
  const last = [...paces].reverse().find((pace) => pace !== null) ?? null;
  if (first === null || last === null || first <= 0) return null;
  if (last > first * 1.25) return "faster";
  if (last < first * 0.8) return "slower";
  return "steady";
}

export function getVoiceMetrics(state: VoiceAccumulator): VoiceMetrics {
  const analyzedSeconds = state.startedAt === null ? 0 : Math.max(0, (state.lastTimestamp - state.startedAt) / 1_000);
  const speechToNoiseDb = state.speechLevelRms > 0
    ? 20 * Math.log10(state.speechLevelRms / Math.max(state.noiseFloorRms, 1e-8))
    : 0;
  const pauseSummary = summarizePauses(state.pauses);
  const volume = summarizeVolume({
    dbSum: state.dbSum,
    dbSquaredSum: state.dbSquaredSum,
    dbCount: state.dbCount,
    speechRunCount: state.speechRunCount,
    trailingOffCount: state.trailingOffCount,
  });
  const pitch = summarizePitch(state.pitchValues);
  const latestTranscript = state.transcript[state.transcript.length - 1] ?? null;
  const voicedFramePercent = state.frameCount > 0 ? (state.voicedFrames / state.frameCount) * 100 : 0;

  const lowConfidence =
    !state.calibrationComplete ||
    speechToNoiseDb < 12 ||
    (state.signals.pitch && state.frameCount > 0 && voicedFramePercent < 8);
  const notEnoughData =
    !state.calibrationComplete ||
    analyzedSeconds < MIN_VOICE_SECONDS ||
    state.frameCount < 60 ||
    state.speechSeconds < 2 ||
    speechToNoiseDb < MIN_SPEECH_TO_NOISE_DB;

  const segments = notEnoughData ? emptySegments(analyzedSeconds) : buildSegments(state, analyzedSeconds);
  const paceTrend = notEnoughData ? null : paceTrendFrom(segments);
  const fillerRate = latestTranscript && analyzedSeconds > 0
    ? latestTranscript.fillerCount / (analyzedSeconds / 60)
    : null;

  return {
    durationSeconds: round(analyzedSeconds, 1),
    analyzedSeconds: round(analyzedSeconds, 1),
    calibrationComplete: state.calibrationComplete,
    noiseFloorDbfs: round(rmsToDbfs(state.noiseFloorRms), 1),
    speechLevelDbfs: round(rmsToDbfs(state.speechLevelRms), 1),
    speechToNoiseDb: round(speechToNoiseDb, 1),
    tooQuiet: state.signals.volume && (speechToNoiseDb < 12 || rmsToDbfs(state.speechLevelRms) < -45),
    lowConfidence,
    notEnoughData,
    signals: state.signals,

    pauseCount: state.signals.pauses ? pauseSummary.pauseCount : null,
    shortPauseCount: state.signals.pauses ? pauseSummary.shortPauseCount : null,
    longPauseCount: state.signals.pauses ? pauseSummary.longPauseCount : null,
    averagePauseSeconds: state.signals.pauses ? round(pauseSummary.averagePauseSeconds, 1) : null,
    longestPauseSeconds: state.signals.pauses ? round(pauseSummary.longestPauseSeconds, 1) : null,
    silentPercent: state.signals.pauses ? round(pauseSummary.silentPercent) : null,

    meanVolumeDbRelative: state.signals.volume && state.dbCount ? round(volume.meanDbRelative, 1) : null,
    volumeVariationDb: state.signals.volume && state.dbCount ? round(volume.variationDb, 1) : null,
    trailingOffCount: state.signals.volume ? volume.trailingOffCount : null,
    trailingOffRatio: state.signals.volume ? round(volume.trailingOffRatio * 100) : null,

    pitchMedianHz: state.signals.pitch && pitch ? round(pitch.medianHz) : null,
    pitchRangeSemitones: state.signals.pitch && pitch ? round(pitch.rangeSemitones, 1) : null,
    pitchVariationSemitones: state.signals.pitch && pitch ? round(pitch.variationSemitones, 1) : null,
    pitchVariety: state.signals.pitch && pitch ? pitch.variety : null,
    voicedFramePercent: state.signals.pitch ? round(voicedFramePercent) : null,

    wordsPerMinute: state.signals.pace && latestTranscript && state.speechSeconds >= 1
      ? round(latestTranscript.wordCount / (state.speechSeconds / 60))
      : null,
    speechActivityPercent: round(clamp(state.speechSeconds / Math.max(analyzedSeconds, 0.001) * 100, 0, 100)),
    paceTrend,

    fillerCount: state.signals.fillers && latestTranscript ? latestTranscript.fillerCount : null,
    fillerRatePerMinute: state.signals.fillers && fillerRate !== null ? round(fillerRate, 1) : null,
    fillerCountApproximate: true,

    segments,
  };
}
