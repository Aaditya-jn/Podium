export const VOICE_SIGNALS = ["pauses", "volume", "pitch", "pace", "fillers"] as const;

export type VoiceSignal = (typeof VOICE_SIGNALS)[number];

export type VoiceSignalToggles = Record<VoiceSignal, boolean>;

export const DEFAULT_VOICE_SIGNALS: VoiceSignalToggles = {
  pauses: true,
  volume: true,
  pitch: true,
  pace: true,
  fillers: true,
};

/** Calibrate the noise floor for the first 2.5 seconds of captured audio. */
export const VOICE_CALIBRATION_MS = 2_500;
/** A silence run shorter than this is treated as normal speech rhythm, not a pause. */
export const MIN_PAUSE_MS = 300;
export const SHORT_PAUSE_MAX_MS = 1_200;
export const LONG_PAUSE_MIN_MS = 2_000;
/** At least this much analysed speech is needed before any voice signal is shown. */
export const MIN_VOICE_SECONDS = 8;
/** Four parts keeps the voice timeline aligned with the four camera segments. */
export const VOICE_SEGMENT_COUNT = 4;
export const MIN_SPEECH_TO_NOISE_DB = 6;

export type PitchVarietyLabel = "monotone" | "some variation" | "varied";
export type PaceTrend = "steady" | "faster" | "slower";
export type SegmentedPaceFlag = "faster" | "slower" | null;

export type VoiceFrame = {
  /** Milliseconds on the same clock used by the accumulator. */
  timestamp: number;
  rms: number;
  dbfs: number;
  /** RMS in dB relative to the speaker's own calibrated speech level. */
  dbRelative: number;
  isSpeech: boolean;
  pitchHz: number | null;
  pitchConfidence: number;
  calibrationComplete: boolean;
  noiseFloorRms: number;
  speechLevelRms: number;
  thresholdRms: number;
};

export type VoiceSegment = {
  label: string;
  analyzedSeconds: number;
  pauseCount: number | null;
  shortPauseCount: number | null;
  longPauseCount: number | null;
  silentPercent: number | null;
  meanVolumeDbRelative: number | null;
  volumeVariationDb: number | null;
  trailingOffCount: number | null;
  pitchVarietySemitones: number | null;
  pitchMedianHz: number | null;
  paceWpm: number | null;
  paceFlag: SegmentedPaceFlag;
  speechActivityPercent: number | null;
  fillerCount: number | null;
  fillerRatePerMinute: number | null;
};

/** Persistable aggregate-only voice information. It never includes audio or raw samples. */
export type VoiceMetrics = {
  durationSeconds: number;
  analyzedSeconds: number;
  calibrationComplete: boolean;
  noiseFloorDbfs: number;
  speechLevelDbfs: number;
  speechToNoiseDb: number;
  tooQuiet: boolean;
  lowConfidence: boolean;
  notEnoughData: boolean;
  signals: VoiceSignalToggles;

  pauseCount: number | null;
  shortPauseCount: number | null;
  longPauseCount: number | null;
  averagePauseSeconds: number | null;
  longestPauseSeconds: number | null;
  silentPercent: number | null;

  meanVolumeDbRelative: number | null;
  volumeVariationDb: number | null;
  trailingOffCount: number | null;
  trailingOffRatio: number | null;

  pitchMedianHz: number | null;
  pitchRangeSemitones: number | null;
  pitchVariationSemitones: number | null;
  pitchVariety: PitchVarietyLabel | null;
  voicedFramePercent: number | null;

  wordsPerMinute: number | null;
  speechActivityPercent: number | null;
  paceTrend: PaceTrend | null;

  fillerCount: number | null;
  fillerRatePerMinute: number | null;
  fillerCountApproximate: true;

  segments: VoiceSegment[];
};
