import { LONG_PAUSE_MIN_MS, MIN_PAUSE_MS, SHORT_PAUSE_MAX_MS } from "@/lib/audio/types";

export type PauseEvent = {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
};

export type PauseDetectorState = {
  enabled: boolean;
  previousTimestamp: number | null;
  silenceStartedAt: number | null;
  silentSeconds: number;
  analyzedSeconds: number;
  pauses: PauseEvent[];
};

export type PauseSummary = {
  pauseCount: number;
  shortPauseCount: number;
  longPauseCount: number;
  averagePauseSeconds: number;
  longestPauseSeconds: number;
  silentPercent: number;
};

export function createPauseDetector(enabled: boolean): PauseDetectorState {
  return {
    enabled,
    previousTimestamp: null,
    silenceStartedAt: null,
    silentSeconds: 0,
    analyzedSeconds: 0,
    pauses: [],
  };
}

function addPauseEvent(state: PauseDetectorState, endedAt: number): PauseEvent | null {
  if (state.silenceStartedAt === null) return null;
  const durationMs = Math.max(0, endedAt - state.silenceStartedAt);
  if (durationMs < MIN_PAUSE_MS) return null;
  return {
    startedAt: state.silenceStartedAt,
    endedAt,
    durationSeconds: durationMs / 1_000,
  };
}

/**
 * Consumes one analysed frame. A pause is only counted once the speaker resumes
 * (or when the session is finalized), so an unfinished silence does not inflate
 * the pause count.
 */
export function addPauseFrame(state: PauseDetectorState, timestamp: number, isSpeech: boolean): PauseDetectorState {
  if (!state.enabled) return state;
  if (state.previousTimestamp === null) {
    return {
      ...state,
      previousTimestamp: timestamp,
      silenceStartedAt: isSpeech ? null : timestamp,
    };
  }

  const deltaSeconds = Math.max(0, Math.min(0.25, (timestamp - state.previousTimestamp) / 1_000));
  const analyzedSeconds = state.analyzedSeconds + deltaSeconds;
  if (isSpeech) {
    const pause = addPauseEvent(state, timestamp);
    return {
      ...state,
      previousTimestamp: timestamp,
      analyzedSeconds,
      silenceStartedAt: null,
      pauses: pause ? [...state.pauses, pause] : state.pauses,
    };
  }

  return {
    ...state,
    previousTimestamp: timestamp,
    analyzedSeconds,
    silentSeconds: state.silentSeconds + deltaSeconds,
    silenceStartedAt: state.silenceStartedAt ?? timestamp,
  };
}

export function finalizePauseDetector(state: PauseDetectorState): PauseDetectorState {
  if (!state.enabled) return state;
  const pause = addPauseEvent(state, state.previousTimestamp ?? 0);
  return {
    ...state,
    silenceStartedAt: null,
    pauses: pause ? [...state.pauses, pause] : state.pauses,
  };
}

export function summarizePauses(state: PauseDetectorState): PauseSummary {
  if (!state.enabled || state.pauses.length === 0) {
    return {
      pauseCount: 0,
      shortPauseCount: 0,
      longPauseCount: 0,
      averagePauseSeconds: 0,
      longestPauseSeconds: 0,
      silentPercent: state.analyzedSeconds > 0 ? Math.min(100, (state.silentSeconds / state.analyzedSeconds) * 100) : 0,
    };
  }
  let total = 0;
  let longest = 0;
  let short = 0;
  let long = 0;
  for (const pause of state.pauses) {
    const ms = pause.durationSeconds * 1_000;
    total += pause.durationSeconds;
    longest = Math.max(longest, pause.durationSeconds);
    if (ms <= SHORT_PAUSE_MAX_MS) short += 1;
    if (ms >= LONG_PAUSE_MIN_MS) long += 1;
  }
  return {
    pauseCount: state.pauses.length,
    shortPauseCount: short,
    longPauseCount: long,
    averagePauseSeconds: total / state.pauses.length,
    longestPauseSeconds: longest,
    silentPercent: state.analyzedSeconds > 0 ? Math.min(100, (state.silentSeconds / state.analyzedSeconds) * 100) : 0,
  };
}
