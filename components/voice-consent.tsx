"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import {
  addTranscriptSnapshot,
  addVoiceFrame,
  createVoiceAccumulator,
  getVoiceMetrics,
  pauseVoiceAccumulator,
  type VoiceAccumulator,
} from "@/lib/audio/aggregation";
import { createVoiceAnalyzer, type VoiceAnalyzer } from "@/lib/audio/analyzer";
import type { CalibrationState } from "@/lib/audio/calibration";
import {
  DEFAULT_VOICE_SIGNALS,
  VOICE_SIGNALS,
  type VoiceMetrics,
  type VoiceSignal,
  type VoiceSignalToggles,
} from "@/lib/audio/types";

export type VoiceConsentHandle = { stop(): void };

type Props = {
  recording: boolean;
  transcript: string;
  /** The MediaRecorder stream when audio fallback is active, so the mic is reused. */
  sharedStream: MediaStream | null;
  onMetrics(metrics: VoiceMetrics | undefined): void;
};

const SIGNAL_LABELS: Record<VoiceSignal, { label: string; detail: string }> = {
  pauses: { label: "Pauses", detail: "Count, length and silent time, split into short and long pauses." },
  volume: { label: "Volume", detail: "Loudness variation, trailing off and a quiet-signal warning." },
  pitch: { label: "Pitch variety", detail: "Range and variation relative to your own median (never emotion)." },
  pace: { label: "Pace over time", detail: "Words per minute per segment and rushing/slowing shifts." },
  fillers: { label: "Filler words", detail: "Approximate count of um, uh, like, you know and similar." },
};

function friendlyMicrophoneError(reason: unknown): string {
  const name = reason instanceof DOMException ? reason.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission wasn’t granted. Allow it in your browser settings, then start recording again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect one, or continue without voice insights.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone may be in use by another app. Close that app and try again.";
  }
  return "Voice analysis couldn’t access the microphone. You can continue without voice insights.";
}

const VoiceConsent = forwardRef<VoiceConsentHandle, Props>(function VoiceConsent(
  { recording, transcript, sharedStream, onMetrics },
  ref,
) {
  const [enabled, setEnabled] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [signals, setSignals] = useState<VoiceSignalToggles>(DEFAULT_VOICE_SIGNALS);
  const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [message, setMessage] = useState("");

  const mountedRef = useRef(true);
  const recordingRef = useRef(recording);
  const transcriptRef = useRef(transcript);
  const onMetricsRef = useRef(onMetrics);
  const analyzerRef = useRef<VoiceAnalyzer | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const accumulatorRef = useRef<VoiceAccumulator | null>(null);
  const ownedStreamRef = useRef<MediaStream | null>(null);
  const calibrationRef = useRef<CalibrationState | undefined>(undefined);
  const lastEmitRef = useRef(0);
  const startingRef = useRef(false);

  transcriptRef.current = transcript;
  onMetricsRef.current = onMetrics;

  const emitMetrics = useCallback((accumulator: VoiceAccumulator, force = false) => {
    const now = performance.now();
    if (!force && now - lastEmitRef.current < 500) return;
    lastEmitRef.current = now;
    const next = getVoiceMetrics(accumulator);
    if (!mountedRef.current) return;
    setMetrics(next);
    onMetricsRef.current(next);
  }, []);

  const stopAnalysis = useCallback(() => {
    const analyzer = analyzerRef.current;
    const accumulator = accumulatorRef.current;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (accumulator) {
      const finalState = pauseVoiceAccumulator(accumulator, performance.now());
      accumulatorRef.current = finalState;
      emitMetrics(finalState, true);
    }
    if (analyzer) {
      calibrationRef.current = analyzer.getCalibration();
      analyzer.stop();
    }
    analyzerRef.current = null;
    ownedStreamRef.current?.getTracks().forEach((track) => track.stop());
    ownedStreamRef.current = null;
    startingRef.current = false;
  }, [emitMetrics]);

  const startAnalysis = useCallback(async () => {
    if (!enabled || !recordingRef.current || analyzerRef.current || startingRef.current) return;
    if (VOICE_SIGNALS.every((signal) => !signals[signal])) return;
    if (!sharedStream && !navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser can’t provide microphone audio for on-device voice analysis.");
      return;
    }

    startingRef.current = true;
    setMessage("");
    let stream = sharedStream;
    let ownsStream = false;
    if (!stream) {
      if (!window.isSecureContext) {
        setMessage("Microphone access needs a secure connection (HTTPS) or localhost.");
        startingRef.current = false;
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        ownsStream = true;
        ownedStreamRef.current = stream;
      } catch (reason) {
        startingRef.current = false;
        if (mountedRef.current) {
          setMessage(friendlyMicrophoneError(reason));
        }
        return;
      }
    }

    if (!mountedRef.current || !recordingRef.current) {
      if (ownsStream) stream.getTracks().forEach((track) => track.stop());
      ownedStreamRef.current = null;
      startingRef.current = false;
      return;
    }

    const analyzer = createVoiceAnalyzer({ signals });
    analyzerRef.current = analyzer;
    unsubscribeRef.current = analyzer.onSample((frame) => {
      const seeded = addTranscriptSnapshot(createVoiceAccumulator(signals), transcriptRef.current, performance.now());
      const current = accumulatorRef.current ?? seeded;
      const updated = addVoiceFrame(current, frame);
      accumulatorRef.current = updated;
      emitMetrics(updated);
    });

    try {
      await analyzer.start(stream, { ownsStream, calibration: calibrationRef.current });
      if (!mountedRef.current || !recordingRef.current) {
        stopAnalysis();
        return;
      }
    } catch {
      analyzer.stop();
      analyzerRef.current = null;
      ownedStreamRef.current = null;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      if (mountedRef.current) {
        setMessage("On-device voice analysis couldn’t start. Your microphone is not being analysed; you can continue without voice insights.");
      }
    } finally {
      startingRef.current = false;
    }
  }, [emitMetrics, enabled, sharedStream, signals, stopAnalysis]);

  useImperativeHandle(ref, () => ({ stop: stopAnalysis }), [stopAnalysis]);

  useEffect(() => {
    mountedRef.current = true;
    function handleVisibility() {
      if (document.visibilityState === "hidden") stopAnalysis();
    }
    function handlePageHide() {
      stopAnalysis();
      sharedStream?.getTracks().forEach((track) => track.stop());
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      analyzerRef.current?.stop();
      analyzerRef.current = null;
      ownedStreamRef.current?.getTracks().forEach((track) => track.stop());
      ownedStreamRef.current = null;
    };
  }, [sharedStream, stopAnalysis]);

  useEffect(() => {
    recordingRef.current = recording;
    if (recording && enabled) {
      void startAnalysis();
    } else if (!recording) {
      stopAnalysis();
    }
  }, [enabled, recording, startAnalysis, stopAnalysis]);

  useEffect(() => {
    const accumulator = accumulatorRef.current;
    if (!accumulator || !transcript) return;
    accumulatorRef.current = addTranscriptSnapshot(accumulator, transcript, performance.now());
  }, [transcript]);

  function resetAnalysis() {
    stopAnalysis();
    accumulatorRef.current = null;
    calibrationRef.current = undefined;
    lastEmitRef.current = 0;
    setMetrics(null);
    onMetricsRef.current(undefined);
    setMessage("");
  }

  function toggleSignal(signal: VoiceSignal, checked: boolean) {
    setSignals((current) => ({ ...current, [signal]: checked }));
    if (metrics) resetAnalysis();
  }

  function disable() {
    resetAnalysis();
    setEnabled(false);
    setShowConsent(false);
  }

  const statusText = message
    ? message
    : !recording
      ? metrics && !metrics.notEnoughData
        ? "Voice analysis paused. Resume your session to continue measuring."
        : "Voice analysis is ready; it starts when you start recording."
      : !metrics || !metrics.calibrationComplete
        ? "Calibrating the noise floor for the first 2.5 seconds…"
        : metrics.notEnoughData
          ? "Not enough voice data yet. Keep speaking; at least 8 seconds after calibration is needed."
          : metrics.lowConfidence
            ? "The signal is quiet or noisy relative to the microphone. Measurements may be unreliable."
            : "On-device voice analysis active (observable cues only).";

  return (
    <section className="camera-panel voice-panel" aria-labelledby="voice-panel-title">
      <div className="camera-panel-heading">
        <div>
          <p className="camera-eyebrow">OPTIONAL · SPEAK MODE</p>
          <h3 id="voice-panel-title">Voice delivery signals</h3>
        </div>
        {enabled && recording && <span className="camera-live" role="status"><span aria-hidden="true" /> Mic analysed on-device</span>}
      </div>

      {!enabled && !showConsent && (
        <>
          <p className="camera-description">Add objective voice-delivery cues: pauses, volume, pitch variety, pace and approximate fillers. Audio is never recorded or uploaded.</p>
          <button className="camera-secondary-button" type="button" onClick={() => { setMessage(""); setShowConsent(true); }}>
            Set up voice analysis
          </button>
        </>
      )}

      {!enabled && showConsent && (
        <div className="camera-consent-copy">
          <p className="camera-description">Before enabling voice analysis:</p>
          <ul>
            <li>Audio is analysed live in this tab with the Web Audio API. No audio is written to disk, stored, uploaded or kept after the rolling analysis buffers. Only aggregate numbers are retained.</li>
            <li>This is separate from the consent-gated audio-transcription recorder. Enabling voice analysis does not enable recording or transcription.</li>
            <li>Microphones, background noise, room acoustics and accents all affect these measurements. Filler counts are approximate because browser transcription often drops “um” and “uh”.</li>
            <li>Measures describe observable delivery only. They never infer emotion, nervousness, confidence, honesty or personality, and they never affect your 0–100 practice score.</li>
          </ul>
          <fieldset className="voice-signal-fieldset">
            <legend>Choose which signals to analyse</legend>
            {VOICE_SIGNALS.map((signal) => (
              <label className="voice-signal-toggle" key={signal}>
                <input
                  type="checkbox"
                  checked={signals[signal]}
                  onChange={(event) => toggleSignal(signal, event.target.checked)}
                />
                <span>
                  <b>{SIGNAL_LABELS[signal].label}</b>
                  <small>{SIGNAL_LABELS[signal].detail}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="voice-consent-note">Microphone permission is requested only when you start recording. Turning voice analysis off removes its stored aggregates.</p>
          <div className="camera-actions">
            <button
              className="camera-primary-button"
              type="button"
              disabled={VOICE_SIGNALS.every((signal) => !signals[signal])}
              onClick={() => {
                setEnabled(true);
                setShowConsent(false);
                setMessage("");
              }}
            >
              Enable voice analysis
            </button>
            <button className="camera-secondary-button" type="button" onClick={() => { setShowConsent(false); setMessage(""); }}>
              Not now
            </button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="voice-enabled-panel">
          <p className="camera-description">{statusText}</p>
          <div className="voice-signal-summary" aria-label="Enabled voice signals">
            {VOICE_SIGNALS.map((signal) => (
              <label className="voice-signal-toggle compact" key={signal}>
                <input
                  type="checkbox"
                  checked={signals[signal]}
                  disabled={recording}
                  onChange={(event) => toggleSignal(signal, event.target.checked)}
                />
                <span>{SIGNAL_LABELS[signal].label}</span>
              </label>
            ))}
          </div>
          <p className="voice-live-note">Only aggregate numbers are kept. Pause, submit, hide the tab or leave the page to stop the microphone and AudioContext.</p>
          <div className="camera-actions">
            <button className="camera-secondary-button" type="button" onClick={disable}>
              Turn voice analysis off
            </button>
          </div>
        </div>
      )}

      {message && <p className="camera-message" role="status">{message}</p>}
    </section>
  );
});

export default VoiceConsent;
