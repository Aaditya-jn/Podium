"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CameraConsent from "@/components/camera-consent";
import ProtectedTextarea from "@/components/protected-textarea";
import { attachRecognitionRecovery, detectSpeechEnvironment, type SpeechEngineLike } from "@/lib/speech/recovery";
import { MAX_SPEECH_AUDIO_BYTES, MAX_SPEECH_AUDIO_DURATION_MS } from "@/lib/speech/limits";
import type { TypingTelemetry } from "@/lib/scoring";
import type { GesturePostureMetrics } from "@/lib/vision/aggregation";

type Mode = "speak" | "write";
type Difficulty = "easy" | "medium" | "hard";
type Topic = { topic: string; category: string; difficulty: Difficulty; source: "trending" | "classic"; source_title: string; source_url: string; published_at: string; source_name: string };
type CaptureMode = "speech" | "audio" | null;

export type AttemptResult = {
  id: string; topic: string; category: string; mode: Mode; difficulty: Difficulty; createdAt: string; durationSeconds: number;
  score: number; breakdown: { length: number; vocabulary: number; clarity: number; pace: number; antiCheatPenalty: number };
  flags: number; labels: string[]; wordCount: number; paceWpm: number; text: string;
  review: { grammar_corrections: { original: string; suggestion: string; reason: string }[]; structure_feedback: string; strengths: string[]; improvements: string[]; improved_sentence: string };
  reviewFallback?: boolean;
  transcriptionSource?: "audio-fallback";
  deliveryInsights?: GesturePostureMetrics;
};

type Props = { topic: Topic; mode: Mode; onBack(): void; onComplete(attempt: AttemptResult): void; onShuffle(): void; shuffling: boolean };
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = SpeechEngineLike & {
  continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechEvent) => void) | null;
  stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
type SpeechNavigator = Navigator & { brave?: unknown };

function countWords(value: string) { return value.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0; }

function chooseAudioMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export default function PracticeSession({ topic, mode, onBack, onComplete, onShuffle, shuffling }: Props) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [telemetry, setTelemetry] = useState<TypingTelemetry>({ keystrokeCount: 0, typingDurationMs: 0, flagCount: 0, tabBlurCount: 0, timeAwayMs: 0 });
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [delivery, setDelivery] = useState<GesturePostureMetrics | undefined>();
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [speechCompatibility, setSpeechCompatibility] = useState("");
  const [speechLikelyUnsupported, setSpeechLikelyUnsupported] = useState(false);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);
  const [fallbackConsentOpen, setFallbackConsentOpen] = useState(false);
  const [recognitionFailed, setRecognitionFailed] = useState(false);
  const [restartCapped, setRestartCapped] = useState(false);
  const [audioFallbackMode, setAudioFallbackMode] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [audioTranscribed, setAudioTranscribed] = useState(false);

  const recordingRef = useRef(false);
  const captureModeRef = useRef<CaptureMode>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recoveryRef = useRef<{ cancel(): void } | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimesRef = useRef<number[]>([]);
  const fatalRecognitionErrorRef = useRef(false);
  const finalTextRef = useRef("");
  const elapsedBeforeRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBytesRef = useRef(0);
  const audioTooLargeRef = useRef(false);
  const audioBlobRef = useRef<Blob | null>(null);
  const audioStopWaitersRef = useRef<Array<(blob: Blob | null) => void>>([]);
  const audioTranscribedRef = useRef(false);

  const onDelivery = useCallback((metrics: GesturePostureMetrics) => setDelivery(metrics), []);
  const wordCount = countWords(text + (interim ? ` ${interim}` : ""));
  const pace = elapsed > 0 ? Math.round(wordCount / elapsed * 60) : 0;

  useEffect(() => {
    if (mode !== "speak") return;
    const timer = window.setTimeout(() => {
      const speechWindow = window as SpeechWindow;
      const recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
      const isBrave = Boolean((navigator as SpeechNavigator).brave);
      const support = detectSpeechEnvironment({ hasRecognition: Boolean(recognition), hasMediaRecorder: typeof MediaRecorder !== "undefined", isBrave });
      setSpeechCompatibility(support.message);
      setSpeechLikelyUnsupported(support.likelyUnsupported);
      setFallbackAvailable(support.fallbackAvailable);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const stopRecognition = useCallback(() => {
    recordingRef.current = false;
    recoveryRef.current?.cancel();
    recoveryRef.current = null;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const clearAudioMemory = useCallback(() => {
    audioChunksRef.current = [];
    audioBytesRef.current = 0;
    audioTooLargeRef.current = false;
    audioBlobRef.current = null;
    if (mountedRef.current) setAudioBlob(null);
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
  }, []);

  const stopAudioRecorder = useCallback((): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return Promise.resolve(audioBlobRef.current);
    return new Promise((resolve) => {
      audioStopWaitersRef.current.push(resolve);
      try { recorder.stop(); }
      catch { audioStopWaitersRef.current = audioStopWaitersRef.current.filter((waiter) => waiter !== resolve); resolve(audioBlobRef.current); }
    });
  }, []);

  const pause = useCallback(() => {
    if (!recordingRef.current) return;
    if (startedAtRef.current !== null) elapsedBeforeRef.current += (Date.now() - startedAtRef.current) / 1000;
    startedAtRef.current = null;
    setElapsed(elapsedBeforeRef.current);
    if (captureModeRef.current === "audio") {
      try { if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.pause(); }
      catch { setError("The audio recording could not pause. Finish it or start a new recording."); }
      recordingRef.current = false;
      setRecording(false);
      setAudioStatus("Audio recording paused. Resume to continue; the microphone is not being recorded while paused.");
    } else {
      stopRecognition();
      setRecording(false);
    }
  }, [stopRecognition]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const activeElapsed = elapsedBeforeRef.current + (startedAtRef.current === null ? 0 : (Date.now() - startedAtRef.current) / 1000);
      if (captureModeRef.current === "audio" && activeElapsed * 1000 >= MAX_SPEECH_AUDIO_DURATION_MS) {
        elapsedBeforeRef.current = MAX_SPEECH_AUDIO_DURATION_MS / 1000;
        startedAtRef.current = null;
        recordingRef.current = false;
        setElapsed(elapsedBeforeRef.current);
        setRecording(false);
        setAudioStatus("The 2-minute recording limit was reached. Finish to transcribe this recording.");
        setError("The 2-minute maximum recording length has been reached.");
        void stopAudioRecorder();
        return;
      }
      setElapsed(activeElapsed);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, stopAudioRecorder]);

  useEffect(() => {
    function visibility() { if (document.visibilityState === "hidden") pause(); }
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [pause]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRecognition();
      recognitionRef.current?.abort();
      const recorder = mediaRecorderRef.current;
      try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch { /* already stopped */ }
      clearAudioMemory();
      if (startedAtRef.current !== null) elapsedBeforeRef.current += (Date.now() - startedAtRef.current) / 1000;
    };
  }, [clearAudioMemory, stopRecognition]);

  function startAudioFallback() {
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio. Try Chrome or Edge, or choose Write mode.");
      setFallbackConsentOpen(false);
      return;
    }
    const currentRecorder = mediaRecorderRef.current;
    if (captureModeRef.current === "audio" && currentRecorder?.state === "paused") {
      try {
        currentRecorder.resume();
        recordingRef.current = true;
        startedAtRef.current = Date.now();
        setAudioStatus("Recording audio for transcription. No live transcript is available in this mode.");
        setRecording(true);
        setFallbackConsentOpen(false);
      } catch { setError("The recording could not resume. Finish this recording and transcribe it, or start again."); }
      return;
    }
    void navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      try {
        const mimeType = chooseAudioMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        clearAudioMemory();
        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;
        audioTranscribedRef.current = false;
        setAudioTranscribed(false);
        captureModeRef.current = "audio";
        setAudioFallbackMode(true);
        audioChunksRef.current = [];
        audioBytesRef.current = 0;
        audioTooLargeRef.current = false;
        audioBlobRef.current = null;
        setAudioBlob(null);
        recorder.ondataavailable = (event) => {
          if (!event.data.size || audioTooLargeRef.current) return;
          audioBytesRef.current += event.data.size;
          if (audioBytesRef.current > MAX_SPEECH_AUDIO_BYTES) {
            audioTooLargeRef.current = true;
            setError("The 8 MB recording limit was reached. Please finish with a shorter recording.");
            setAudioStatus("The recording is too large to transcribe. Discard it and record a shorter response.");
            if (recorder.state !== "inactive") recorder.stop();
            recordingRef.current = false;
            startedAtRef.current = null;
            setRecording(false);
            return;
          }
          audioChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          const blob = !audioTooLargeRef.current && audioChunksRef.current.length
            ? new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })
            : null;
          audioChunksRef.current = [];
          mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          if (blob && blob.size <= MAX_SPEECH_AUDIO_BYTES) {
            audioBlobRef.current = blob;
            if (mountedRef.current) { setAudioBlob(blob); setAudioStatus("Recording ready. Finish to send it for transcription."); }
          } else {
            audioBlobRef.current = null;
            if (mountedRef.current && !audioTooLargeRef.current) setAudioStatus("No audio was captured. Start a new recording and try again.");
          }
          const waiters = audioStopWaitersRef.current.splice(0);
          waiters.forEach((resolve) => resolve(blob && blob.size <= MAX_SPEECH_AUDIO_BYTES ? blob : null));
        };
        recorder.onerror = () => {
          setError("The microphone recording failed. Check microphone access and try again.");
          recordingRef.current = false;
          setRecording(false);
          void stopAudioRecorder();
        };
        recorder.start(1000);
        recordingRef.current = true;
        startedAtRef.current = Date.now();
        elapsedBeforeRef.current = 0;
        setElapsed(0);
        setAudioStatus("Recording audio for transcription. No live transcript is available in this mode.");
        setRecording(true);
        setFallbackConsentOpen(false);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        setError("Audio recording could not start in this browser. Try Chrome or Edge, or choose Write mode.");
      }
    }).catch((reason: unknown) => {
      const name = reason instanceof DOMException ? reason.name : "";
      setError(name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "Microphone permission was denied. Allow it in browser settings to use audio transcription."
        : name === "NotFoundError"
          ? "No microphone was found. Connect one or choose Write mode."
          : "The microphone could not start. Check browser access and try Chrome or Edge.");
    });
  }

  function startSpeechRecognition() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition || speechLikelyUnsupported) {
      setFallbackConsentOpen(true);
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTextRef.current = `${finalTextRef.current} ${result[0].transcript}`.trim();
        else pending += result[0].transcript;
      }
      setText(finalTextRef.current);
      setInterim(pending.trim());
      setError("");
    };
    recognitionRef.current = recognition;
    recoveryRef.current = attachRecognitionRecovery({
      engine: recognition,
      isRecording: () => recordingRef.current,
      restarts: restartTimesRef.current,
      now: Date.now,
      schedule: (callback) => { restartTimerRef.current = setTimeout(callback, 250); return restartTimerRef.current; },
      cancelSchedule: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); restartTimerRef.current = null; },
      onBenign: (message) => { if (message) setError(message); },
      onFatal: (message) => { fatalRecognitionErrorRef.current = true; setRecognitionFailed(true); setError(message); pause(); },
      onRestartCap: () => {
        fatalRecognitionErrorRef.current = true;
        setRestartCapped(true);
        setRecognitionFailed(true);
        setError("Speech recognition stopped after several interruptions. Try Chrome or Edge, or use audio transcription instead.");
        pause();
      },
    });
    try {
      recognition.start();
      captureModeRef.current = "speech";
      recordingRef.current = true;
      startedAtRef.current = Date.now();
      setRecording(true);
    } catch {
      fatalRecognitionErrorRef.current = true;
      setRecognitionFailed(true);
      setError("Speech recognition could not start. Try Chrome or Edge, or use audio transcription instead.");
      recoveryRef.current.cancel();
    }
  }

  function start() {
    setError("");
    setRestartCapped(false);
    setRecognitionFailed(false);
    fatalRecognitionErrorRef.current = false;
    restartTimesRef.current = [];
    if (mode === "write") {
      captureModeRef.current = null;
      recordingRef.current = true;
      startedAtRef.current = Date.now();
      setRecording(true);
      return;
    }
    if (captureModeRef.current === "audio" && mediaRecorderRef.current?.state === "paused") {
      startAudioFallback();
      return;
    }
    if (captureModeRef.current === "audio" && !audioTranscribedRef.current) {
      if (audioBlobRef.current) return;
      setFallbackConsentOpen(true);
      return;
    }
    if (speechLikelyUnsupported) {
      setFallbackConsentOpen(true);
      return;
    }
    startSpeechRecognition();
  }

  async function submit() {
    let content = `${text}${interim ? ` ${interim}` : ""}`.trim();
    const needsAudioTranscription = audioFallbackMode && !audioTranscribedRef.current;
    if (!content && !needsAudioTranscription) { setError("Add a few words before submitting."); return; }
    pause();
    setSubmitting(true);
    setError("");
    try {
      if (needsAudioTranscription) {
        const blob = await stopAudioRecorder();
        if (!blob) throw new Error("No usable audio remains. Record a shorter response and try again.");
        setTranscribing(true);
        setAudioStatus("Sending audio for private transcription…");
        try {
          const durationMs = Math.max(1, Math.round(elapsedBeforeRef.current * 1000));
          const mimeType = (blob.type || "audio/webm").split(";")[0] || "audio/webm";
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": mimeType, "X-Audio-Mime": mimeType, "X-Audio-Duration-Ms": String(durationMs) },
            body: blob,
            cache: "no-store",
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Transcription failed. Please record again.");
          const transcript = String(data.transcript ?? "").trim();
          if (!transcript) throw new Error("No transcript came back. Please record again.");
          content = transcript;
          setText(transcript);
          audioTranscribedRef.current = true;
          setAudioTranscribed(true);
        } finally {
          clearAudioMemory();
          setTranscribing(false);
        }
      }
      if (countWords(content) < 12 && !window.confirm("This response is quite short. Submit it anyway?")) return;
      const scored = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content, mode, difficulty: topic.difficulty, durationSeconds: elapsedBeforeRef.current, typingTelemetry: mode === "write" ? telemetry : undefined }) });
      const scoreData = await scored.json();
      if (!scored.ok) throw new Error(scoreData.error ?? "Your attempt could not be scored. Please try again.");
      const reviewed = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }) });
      const reviewData = await reviewed.json();
      const attempt: AttemptResult = {
        id: crypto.randomUUID(), topic: topic.topic, category: topic.category, mode, difficulty: topic.difficulty,
        createdAt: new Date().toISOString(), durationSeconds: Math.round(elapsedBeforeRef.current), ...scoreData,
        text: content, review: reviewData.review, reviewFallback: Boolean(reviewData.fallback),
        transcriptionSource: audioFallbackMode ? "audio-fallback" : undefined,
        deliveryInsights: mode === "speak" ? delivery : undefined,
      };
      clearAudioMemory();
      setCameraEnabled(false);
      onComplete(attempt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong while submitting. Please try again.");
    } finally { setSubmitting(false); setTranscribing(false); }
  }

  const activeText = mode === "write" ? text : `${text}${interim ? ` ${interim}` : ""}`;
  const audioRecording = mode === "speak" && audioFallbackMode;

  return (
    <section className="practice-card practice-session" aria-labelledby="session-title">
      <div className="session-kicker"><span className="step-pill"><span>02</span> &nbsp; PRACTICE</span><button className="text-button" type="button" onClick={() => { pause(); clearAudioMemory(); onBack(); }}>← Back to topic</button></div>
      <h2 id="session-title">Take a moment. Then begin.</h2>
      <div className="session-topic"><div className="topic-kicker"><span>YOUR TOPIC</span><button type="button" onClick={onShuffle} disabled={shuffling || recording}>{shuffling ? "Finding…" : "⟳ Shuffle"}</button></div><p>{topic.topic}</p><span className="topic-meta">{topic.category} · {topic.difficulty} · {mode === "speak" ? "Speaking" : "Writing"}</span>{topic.source === "trending" && <a className="topic-session-source" href={topic.source_url} target="_blank" rel="noreferrer noopener">Trending · {topic.source_name}</a>}</div>
      <div className="session-stats" aria-live="polite">
        <div><span>TIMER</span><strong>{Math.floor(elapsed / 60).toString().padStart(2, "0")}:{Math.floor(elapsed % 60).toString().padStart(2, "0")}</strong></div>
        {audioRecording ? <div className="audio-recording-indicator" role="status"><span className={recording ? "audio-dot active" : "audio-dot"} /><strong>{recording ? "Recording audio" : audioStatus.startsWith("Recording ready") ? "Ready to transcribe" : "Audio paused"}</strong><small>No live transcript</small></div> : <><div><span>WORDS</span><strong>{wordCount}</strong></div><div><span>PACE</span><strong>{pace} <small>wpm</small></strong></div></>}
      </div>

      {mode === "write" ? <ProtectedTextarea value={text} onChange={setText} onTelemetry={setTelemetry} disabled={!recording || submitting} /> : audioRecording ? <div className="transcript-box audio-fallback-status" role="status"><span className="field-label">Audio transcription</span><p>{transcribing ? "Transcribing your recording…" : audioStatus || "No live transcript is available in audio transcription mode."}</p><small>Your recording stays in this tab until transcription is requested.</small></div> : <div className="transcript-box"><span className="field-label">Live transcript</span><p aria-live="polite">{activeText || (recording ? "Listening… your words will appear here." : "Start recording to begin your transcript.")}</p></div>}

      {mode === "speak" && speechCompatibility && <p className="speech-compatibility" role="status">{speechCompatibility}</p>}
      {mode === "speak" && fallbackConsentOpen && <div className="audio-consent" role="region" aria-labelledby="audio-consent-title"><h3 id="audio-consent-title">Audio transcription consent</h3><p>Podium will record audio in this tab and send it to Google Gemini for transcription when you finish. The recording is held temporarily in memory, is not saved to Podium or a database, and is deleted after the transcription request. Maximum recording: 2 minutes or 8 MB.</p><div className="camera-actions"><button className="camera-primary-button" type="button" onClick={startAudioFallback}>I understand — start audio recording</button><button className="camera-secondary-button" type="button" onClick={() => setFallbackConsentOpen(false)}>Cancel</button></div></div>}
      {mode === "speak" && fallbackAvailable && (speechLikelyUnsupported || recognitionFailed || restartCapped) && !fallbackConsentOpen && <button className="camera-secondary-button fallback-open-button" type="button" onClick={() => setFallbackConsentOpen(true)}>Set up audio transcription</button>}
      {mode === "speak" && <div className="camera-session-area"><div className="camera-optional-toggle"><button className="camera-secondary-button" type="button" onClick={() => setCameraEnabled((value) => !value)} aria-expanded={cameraEnabled}>{cameraEnabled ? "Hide camera options" : "Optional delivery insights"}</button><p>Face and posture measures stay on this device and do not affect your score.</p></div>{cameraEnabled && <CameraConsent recording={recording} onMetrics={onDelivery} />}</div>}

      <div className="session-controls">
        {!recording ? <button className="start-button" type="button" onClick={start} disabled={submitting || transcribing || (mode === "speak" && speechLikelyUnsupported && !fallbackAvailable) || Boolean(audioBlob && audioRecording && !audioTranscribed)}><span>{audioBlob && audioRecording ? "Recording ready — finish to transcribe" : audioRecording ? elapsed > 0 ? "Resume audio" : "Start audio" : speechLikelyUnsupported && mode === "speak" ? "Set up audio transcription" : elapsed > 0 ? "Resume" : mode === "speak" ? "Start recording" : "Start writing"}</span><span className="button-arrow">↗</span></button> : <button className="camera-secondary-button pause-button" type="button" onClick={pause}>Pause</button>}
        <button className="submit-button" type="button" onClick={submit} disabled={submitting || transcribing || (!activeText.trim() && !(audioRecording && (recording || audioBlob)))}>{submitting ? "Preparing review…" : transcribing ? "Transcribing…" : "Finish & review"}</button>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
