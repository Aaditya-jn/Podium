"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addGesturePostureSample,
  createGesturePostureAccumulator,
  getGesturePostureMetrics,
  pauseGesturePostureAccumulator,
  type GesturePostureMetrics,
  type GesturePostureAccumulator,
} from "@/lib/vision/aggregation";
import { createDeliveryTracker } from "@/lib/vision/mediapipe-tracker";
import type { DeliveryTracker } from "@/lib/vision/types";
import { shouldRunCameraTracking, stopMediaStreamTracks } from "@/lib/vision/lifecycle";

type CameraStep = "closed" | "consent" | "requesting" | "loading" | "preview";

function friendlyCameraError(reason: unknown): string {
  const name = reason instanceof DOMException ? reason.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission wasn’t granted. You can allow it in your browser settings and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found. Connect a camera or continue without camera insights.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera may be in use by another app. Close that app and try again.";
  }
  return "The camera couldn’t be started. You can continue speaking without it.";
}

export default function CameraConsent({ recording, onMetrics }: { recording: boolean; onMetrics(metrics: GesturePostureMetrics): void }) {
  const [step, setStep] = useState<CameraStep>("closed");
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState<GesturePostureMetrics | null>(null);
  const [analysisUnavailable, setAnalysisUnavailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<DeliveryTracker | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const accumulatorRef = useRef<GesturePostureAccumulator | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const wasRecordingRef = useRef(false);

  const stopCamera = useCallback(() => {
    requestIdRef.current += 1;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    trackerRef.current?.stop();
    trackerRef.current = null;
    if (accumulatorRef.current) accumulatorRef.current = pauseGesturePostureAccumulator(accumulatorRef.current, performance.now());
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stopMediaStreamTracks(stream);
    if (videoRef.current) videoRef.current.srcObject = null;
    setStep((current) => current === "preview" || current === "loading" ? "consent" : current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        stopCamera();
        setMessage("Camera stopped while this tab is hidden. Enable it again when you’re ready.");
      }
    }
    function handlePageHide() {
      stopCamera();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) stopMediaStreamTracks(stream);
      unsubscribeRef.current?.();
      trackerRef.current?.stop();
    };
  }, [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if ((step !== "preview" && step !== "loading") || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      setMessage("The camera preview couldn’t start. Turn the camera off and try again.");
    });
  }, [step]);

  useEffect(() => {
    if (!recording) {
      if (wasRecordingRef.current && (streamRef.current || trackerRef.current)) {
        stopCamera();
        setMessage("Camera stopped while paused. Enable it again after resuming if you want delivery insights.");
      }
      wasRecordingRef.current = false;
      return;
    }
    wasRecordingRef.current = true;
    const video = videoRef.current;
    if (!video || trackerRef.current || !shouldRunCameraTracking({ consented: Boolean(streamRef.current), recording, pageVisible: document.visibilityState === "visible" })) return;
    let cancelled = false;
    const tracker = createDeliveryTracker();
    trackerRef.current = tracker;
    unsubscribeRef.current = tracker.onSample((sample) => {
      const current = accumulatorRef.current ?? createGesturePostureAccumulator(sample.timestamp);
      const updated = addGesturePostureSample(current, sample);
      accumulatorRef.current = updated;
      const nextMetrics = getGesturePostureMetrics(updated);
      setMetrics(nextMetrics);
      onMetrics(nextMetrics);
    });
    setStep("loading");
    void tracker.start(video).then(() => {
      if (!cancelled && mountedRef.current && recording) setStep("preview");
    }).catch(() => {
      if (cancelled || !mountedRef.current) return;
      tracker.stop();
      trackerRef.current = null;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setAnalysisUnavailable(true);
      setStep("preview");
      setMessage("On-device movement analysis couldn’t start. Your camera preview remains local; turn it off or try again.");
    });
    return () => { cancelled = true; };
  }, [onMetrics, recording, stopCamera, step]);

  async function enableCamera() {
    setMessage("");
    if (!window.isSecureContext) {
      setMessage("Camera access needs a secure connection (HTTPS) or localhost.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser doesn’t support camera access. You can continue without camera insights.");
      return;
    }

    setStep("requesting");
    const requestId = ++requestIdRef.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" } },
        audio: false,
      });
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        stopMediaStreamTracks(stream);
        return;
      }
      streamRef.current = stream;
    } catch (reason) {
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      setStep("consent");
      setMessage(friendlyCameraError(reason));
      return;
    }

    const video = videoRef.current;
    if (!video) {
      stopMediaStreamTracks(stream);
      streamRef.current = null;
      setStep("consent");
      setMessage("The camera preview could not be prepared. You can continue without camera insights.");
      return;
    }

    video.srcObject = stream;
    setStep("loading");
    setMessage("");
    setAnalysisUnavailable(false);
    try {
      await video.play();
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      setStep("preview");
    } catch {
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      trackerRef.current?.stop();
      trackerRef.current = null;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setAnalysisUnavailable(false);
      setStep("consent");
      setMessage("The camera preview couldn’t start. Turn it off or try again.");
    }
  }

  return (
    <section className="camera-panel" aria-labelledby="camera-panel-title">
      <div className="camera-panel-heading">
        <div>
          <p className="camera-eyebrow">OPTIONAL · SPEAK MODE</p>
          <h3 id="camera-panel-title">Delivery insights</h3>
        </div>
        {(step === "loading" || step === "preview") && <span className="camera-live" role="status"><span aria-hidden="true" /> Camera on</span>}
      </div>
      <video ref={videoRef} className="camera-preview" autoPlay muted playsInline hidden={step !== "loading" && step !== "preview"} aria-label="Live camera preview, shown only on this device" />

      {step === "closed" && (
        <>
          <p className="camera-description">Enable the optional camera during a speaking session. Movement tracking runs only while you’re recording.</p>
          <button className="camera-secondary-button" type="button" onClick={() => { setMessage(""); setStep("consent"); }}>
            Set up camera preview
          </button>
        </>
      )}

      {step === "consent" && (
        <div className="camera-consent-copy">
          <p className="camera-description">Before enabling the camera:</p>
          <ul>
            <li>Delivery insights may examine face presence, gaze, expression, hand movement, shoulder alignment, and posture changes while you speak.</li>
            <li>Video and facial landmarks stay on this device. Nothing is uploaded or saved.</li>
            <li>This is optional. Speak mode works without the camera.</li>
          </ul>
          <div className="camera-actions">
            <button className="camera-primary-button" type="button" onClick={enableCamera}>
              Enable camera
            </button>
            <button className="camera-secondary-button" type="button" onClick={() => { setStep("closed"); setMessage(""); }}>
              Not now
            </button>
          </div>
        </div>
      )}

      {step === "requesting" && <p className="camera-description" role="status">Waiting for camera permission…</p>}

      {step === "loading" && <p className="camera-description" role="status">Loading on-device vision models… Your preview and analysis stay on this device.</p>}

      {(step === "loading" || step === "preview") && (
        <div className="camera-preview-wrap">
          <div className="camera-preview-footer">
            <div>
              <p className="camera-description">Live preview and movement analysis stay on this device. No images or landmarks are saved.</p>
              {step === "preview" && !recording && <p className="camera-analysis-status" role="status">Camera is ready. Movement tracking begins when recording starts.</p>}
              {step === "preview" && recording && !analysisUnavailable && <p className="camera-analysis-status" role="status">
                {!metrics?.calibrationComplete ? "For the first 3 seconds, keep a comfortable, neutral posture while calibration runs…" : metrics.lowConfidence
                  ? "Detection quality is low. Try brighter lighting and a clearer camera angle; measurements may be unreliable."
                  : "On-device hand and posture tracking is active."}
              </p>}
            </div>
            <button className="camera-secondary-button" type="button" onClick={() => { stopCamera(); setMessage("Camera is off."); }}>
              Turn camera off
            </button>
          </div>
        </div>
      )}

      {message && <p className="camera-message" role="status">{message}</p>}
    </section>
  );
}
