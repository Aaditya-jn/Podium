"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CameraConsent from "@/components/camera-consent";
import ProtectedTextarea from "@/components/protected-textarea";
import type { TypingTelemetry } from "@/lib/scoring";
import type { GesturePostureMetrics } from "@/lib/vision/aggregation";

type Mode = "speak" | "write";
type Difficulty = "easy" | "medium" | "hard";
type Topic = { topic: string; category: string; difficulty: Difficulty; source: "trending" | "classic"; source_title: string; source_url: string; published_at: string; source_name: string };
export type AttemptResult = {
  id: string; topic: string; category: string; mode: Mode; difficulty: Difficulty; createdAt: string; durationSeconds: number;
  score: number; breakdown: { length: number; vocabulary: number; clarity: number; pace: number; antiCheatPenalty: number };
  flags: number; labels: string[]; wordCount: number; paceWpm: number; text: string;
  review: { grammar_corrections: { original: string; suggestion: string; reason: string }[]; structure_feedback: string; strengths: string[]; improvements: string[]; improved_sentence: string };
  reviewFallback?: boolean;
  deliveryInsights?: GesturePostureMetrics;
};

type Props = { topic: Topic; mode: Mode; onBack(): void; onComplete(attempt: AttemptResult): void; onShuffle(): void; shuffling: boolean };

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null; start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

function countWords(value: string) { return value.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0; }

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
  const recordingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTextRef = useRef("");
  const elapsedBeforeRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);

  const onDelivery = useCallback((metrics: GesturePostureMetrics) => setDelivery(metrics), []);
  const wordCount = countWords(text + (interim ? ` ${interim}` : ""));
  const pace = elapsed > 0 ? Math.round(wordCount / elapsed * 60) : 0;

  const stopRecognition = useCallback(() => {
    recordingRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const pause = useCallback(() => {
    if (!recordingRef.current) return;
    if (startedAtRef.current !== null) elapsedBeforeRef.current += (Date.now() - startedAtRef.current) / 1000;
    startedAtRef.current = null;
    setElapsed(elapsedBeforeRef.current);
    stopRecognition();
    setRecording(false);
  }, [stopRecognition]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setElapsed(elapsedBeforeRef.current + (startedAtRef.current === null ? 0 : (Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    function visibility() { if (document.visibilityState === "hidden") pause(); }
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [pause]);

  useEffect(() => () => {
    stopRecognition();
    recognitionRef.current?.abort();
    if (startedAtRef.current !== null) elapsedBeforeRef.current += (Date.now() - startedAtRef.current) / 1000;
  }, [stopRecognition]);

  function start() {
    setError("");
    if (mode === "speak") {
      const SpeechRecognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
      if (!SpeechRecognition) { setError("Speech recognition isn’t available in this browser. Try Chrome or Edge, or choose Write mode."); return; }
      const recognition = new SpeechRecognition();
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
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") { setError("Microphone permission was denied. Allow microphone access in your browser, then resume."); pause(); }
        else if (event.error === "no-speech") setError("No speech was detected. You can keep speaking or pause when you’re done.");
      };
      recognition.onend = () => {
        if (!recordingRef.current) return;
        restartTimerRef.current = setTimeout(() => {
          if (recordingRef.current) { try { recognition.start(); } catch { /* a recognizer can still be winding down */ } }
        }, 250);
      };
      recognitionRef.current = recognition;
      try { recognition.start(); } catch { setError("The microphone could not start. Check browser permissions and try again."); return; }
    }
    recordingRef.current = true;
    startedAtRef.current = Date.now();
    setRecording(true);
  }

  async function submit() {
    const content = `${text}${interim ? ` ${interim}` : ""}`.trim();
    if (!content) { setError("Add a few words before submitting."); return; }
    if (countWords(content) < 12 && !window.confirm("This response is quite short. Submit it anyway?")) return;
    pause();
    setSubmitting(true);
    setError("");
    try {
      const scored = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content, mode, difficulty: topic.difficulty, durationSeconds: elapsedBeforeRef.current, typingTelemetry: mode === "write" ? telemetry : undefined }) });
      const scoreData = await scored.json();
      if (!scored.ok) throw new Error(scoreData.error ?? "Your attempt could not be scored. Please try again.");
      const reviewed = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }) });
      const reviewData = await reviewed.json();
      const attempt: AttemptResult = {
        id: crypto.randomUUID(), topic: topic.topic, category: topic.category, mode, difficulty: topic.difficulty,
        createdAt: new Date().toISOString(), durationSeconds: Math.round(elapsedBeforeRef.current), ...scoreData,
        text: content, review: reviewData.review, reviewFallback: Boolean(reviewData.fallback), deliveryInsights: mode === "speak" ? delivery : undefined,
      };
      setCameraEnabled(false);
      onComplete(attempt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong while submitting. Please try again.");
    } finally { setSubmitting(false); }
  }

  const activeText = mode === "write" ? text : `${text}${interim ? ` ${interim}` : ""}`;

  return (
    <section className="practice-card practice-session" aria-labelledby="session-title">
      <div className="session-kicker"><span className="step-pill"><span>02</span> &nbsp; PRACTICE</span><button className="text-button" type="button" onClick={() => { pause(); onBack(); }}>← Back to topic</button></div>
      <h2 id="session-title">Take a moment. Then begin.</h2>
      <div className="session-topic"><div className="topic-kicker"><span>YOUR TOPIC</span><button type="button" onClick={onShuffle} disabled={shuffling || recording}>{shuffling ? "Finding…" : "⟳ Shuffle"}</button></div><p>{topic.topic}</p><span className="topic-meta">{topic.category} · {topic.difficulty} · {mode === "speak" ? "Speaking" : "Writing"}</span>{topic.source === "trending" && <a className="topic-session-source" href={topic.source_url} target="_blank" rel="noreferrer noopener">Trending · {topic.source_name}</a>}</div>
      <div className="session-stats" aria-live="polite"><div><span>TIMER</span><strong>{Math.floor(elapsed / 60).toString().padStart(2, "0")}:{Math.floor(elapsed % 60).toString().padStart(2, "0")}</strong></div><div><span>WORDS</span><strong>{wordCount}</strong></div><div><span>PACE</span><strong>{pace} <small>wpm</small></strong></div></div>
      {mode === "write" ? <ProtectedTextarea value={text} onChange={setText} onTelemetry={setTelemetry} disabled={!recording || submitting} /> : <div className="transcript-box"><span className="field-label">Live transcript</span><p aria-live="polite">{activeText || (recording ? "Listening… your words will appear here." : "Start recording to begin your transcript.")}</p></div>}
      {mode === "speak" && <div className="camera-session-area"><div className="camera-optional-toggle"><button className="camera-secondary-button" type="button" onClick={() => setCameraEnabled((value) => !value)} aria-expanded={cameraEnabled}>{cameraEnabled ? "Hide camera options" : "Optional delivery insights"}</button><p>Face and posture measures stay on this device and do not affect your score.</p></div>{cameraEnabled && <CameraConsent recording={recording} onMetrics={onDelivery} />}</div>}
      <div className="session-controls">{!recording ? <button className="start-button" type="button" onClick={start} disabled={submitting}><span>{elapsed > 0 ? "Resume" : mode === "speak" ? "Start recording" : "Start writing"}</span><span className="button-arrow">↗</span></button> : <button className="camera-secondary-button pause-button" type="button" onClick={pause}>Pause</button>}
        <button className="submit-button" type="button" onClick={submit} disabled={submitting || !activeText.trim()}>{submitting ? "Reviewing…" : "Finish & review"}</button>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
