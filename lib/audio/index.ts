export { createVoiceAnalyzer } from "@/lib/audio/analyzer";
export type { VoiceAnalyzer, VoiceAnalyzerOptions, VoiceAnalyzerStartOptions } from "@/lib/audio/analyzer";
export {
  addTranscriptSnapshot,
  addVoiceFrame,
  createVoiceAccumulator,
  getVoiceMetrics,
  pauseVoiceAccumulator,
} from "@/lib/audio/aggregation";
export type { VoiceAccumulator } from "@/lib/audio/aggregation";
export {
  addCalibrationSample,
  adaptNoiseFloor,
  createNoiseCalibration,
  finalizeNoiseCalibration,
  percentile,
  rmsToDbfs,
  type CalibrationState,
} from "@/lib/audio/calibration";
export { countFillers, countWords, FILLER_PATTERN, type FillerCount } from "@/lib/audio/fillers";
export { addPauseFrame, createPauseDetector, finalizePauseDetector, summarizePauses } from "@/lib/audio/pauses";
export type { PauseDetectorState, PauseEvent, PauseSummary } from "@/lib/audio/pauses";
export { estimatePitch, summarizePitch, type PitchEstimate, type PitchSummary } from "@/lib/audio/pitch";
export { detectTrailingOff, relativeDb, rootMeanSquare, summarizeVolume } from "@/lib/audio/volume";
export * from "@/lib/audio/types";
