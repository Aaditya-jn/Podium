import {
  adaptNoiseFloor,
  addCalibrationSample,
  createNoiseCalibration,
  rmsToDbfs,
  type CalibrationState,
} from "@/lib/audio/calibration";
import { estimatePitch } from "@/lib/audio/pitch";
import { DEFAULT_VOICE_SIGNALS, type VoiceFrame, type VoiceSignalToggles } from "@/lib/audio/types";
import { relativeDb, rootMeanSquare } from "@/lib/audio/volume";

export type VoiceAnalyzerOptions = {
  signals: VoiceSignalToggles;
  /** Base sampling interval. 33 ms is about 30 frames per second. */
  sampleIntervalMs?: number;
  maxSampleIntervalMs?: number;
  now?: () => number;
};

export type VoiceAnalyzerStartOptions = {
  /** True only when the analyzer obtained the microphone stream itself. */
  ownsStream?: boolean;
  calibration?: CalibrationState;
};

/**
 * Small on-device audio capture interface. It emits scalar frames only; the
 * analyser buffer is reused and never copied, stored or uploaded.
 */
export type VoiceAnalyzer = {
  start(stream: MediaStream, options?: VoiceAnalyzerStartOptions): Promise<void>;
  stop(): void;
  onSample(listener: (frame: VoiceFrame) => void): () => void;
  getCalibration(): CalibrationState;
  isRunning(): boolean;
};

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;
type AudioGlobal = typeof globalThis & {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
};

const DEFAULT_INTERVAL_MS = 33;
const MIN_INTERVAL_MS = 20;
const MAX_INTERVAL_MS = 100;

function resolveAudioContext(): AudioContextConstructor | null {
  const audioGlobal = globalThis as AudioGlobal;
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext ?? null;
}

export function createVoiceAnalyzer(options: VoiceAnalyzerOptions): VoiceAnalyzer {
  const signals = options.signals ?? DEFAULT_VOICE_SIGNALS;
  const baseInterval = Math.max(MIN_INTERVAL_MS, options.sampleIntervalMs ?? DEFAULT_INTERVAL_MS);
  const maxInterval = Math.max(baseInterval, Math.min(MAX_INTERVAL_MS, options.maxSampleIntervalMs ?? MAX_INTERVAL_MS));
  const now = options.now ?? (() => performance.now());
  const listeners = new Set<(frame: VoiceFrame) => void>();

  let running = false;
  let intervalMs = baseInterval;
  let slowTicks = 0;
  let fastTicks = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;
  let ownsStream = false;
  let stream: MediaStream | null = null;
  let calibration = createNoiseCalibration();

  function stopTracks() {
    if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
  }

  function clearNodes() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    try { source?.disconnect(); } catch { /* already disconnected */ }
    try { analyser?.disconnect(); } catch { /* already disconnected */ }
    source = null;
    analyser = null;
    buffer = null;
    const currentContext = context;
    context = null;
    if (currentContext && currentContext.state !== "closed") {
      void currentContext.close().catch(() => { /* the context may already be closing */ });
    }
  }

  function emit(frame: VoiceFrame) {
    listeners.forEach((listener) => listener(frame));
  }

  function schedule() {
    if (!running) return;
    timer = setTimeout(tick, intervalMs);
  }

  function tick() {
    if (!running || !analyser || !context || !buffer) return;
    const startedAt = now();
    try {
      analyser.getFloatTimeDomainData(buffer);
    } catch {
      return;
    }
    const rawRms = rootMeanSquare(buffer);
    const timestamp = startedAt;

    if (!calibration.complete) {
      calibration = addCalibrationSample(calibration, rawRms, timestamp);
    } else {
      const speech = rawRms > calibration.thresholdRms;
      calibration = adaptNoiseFloor(calibration, rawRms, speech);
    }

    const isSpeech = calibration.complete && rawRms > calibration.thresholdRms;
    const pitch = signals.pitch && isSpeech ? estimatePitch(buffer, context.sampleRate) : null;

    emit({
      timestamp,
      rms: rawRms,
      dbfs: rmsToDbfs(rawRms),
      dbRelative: relativeDb(rawRms, calibration.speechLevelRms),
      isSpeech,
      pitchHz: pitch?.voiced ? pitch.frequencyHz : null,
      pitchConfidence: pitch?.confidence ?? 0,
      calibrationComplete: calibration.complete,
      noiseFloorRms: calibration.noiseFloorRms,
      speechLevelRms: calibration.speechLevelRms,
      thresholdRms: calibration.thresholdRms,
    });

    // Adaptive throttling: if analysis is consistently expensive, sample less
    // often (down to 10 fps) instead of letting the interface fall behind.
    const cost = now() - startedAt;
    if (cost > 10) {
      slowTicks += 1;
      fastTicks = 0;
      if (slowTicks >= 3 && intervalMs < maxInterval) {
        intervalMs = Math.min(maxInterval, intervalMs * 2);
        slowTicks = 0;
      }
    } else {
      slowTicks = 0;
      if (cost < 3) {
        fastTicks += 1;
        if (fastTicks >= 20 && intervalMs > baseInterval) {
          intervalMs = Math.max(baseInterval, intervalMs * 0.75);
          fastTicks = 0;
        }
      }
    }
    schedule();
  }

  return {
    async start(nextStream, startOptions = {}) {
      if (running) return;
      const AudioContextClass = resolveAudioContext();
      if (!AudioContextClass) throw new Error("Web Audio is not available in this browser.");
      if (!nextStream) throw new Error("No microphone stream was provided.");

      stream = nextStream;
      ownsStream = Boolean(startOptions.ownsStream);
      if (startOptions.calibration) calibration = { ...startOptions.calibration };
      context = new AudioContextClass({ latencyHint: "interactive" });
      try { await context.resume(); } catch { /* it may already be running */ }

      source = context.createMediaStreamSource(nextStream);
      analyser = context.createAnalyser();
      analyser.fftSize = 2_048;
      analyser.smoothingTimeConstant = 0;
      buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      source.connect(analyser);
      running = true;
      intervalMs = baseInterval;
      schedule();
    },

    stop() {
      running = false;
      stopTracks();
      clearNodes();
      stream = null;
      ownsStream = false;
    },

    onSample(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getCalibration() {
      return { ...calibration, values: [] };
    },

    isRunning() {
      return running;
    },
  };
}
