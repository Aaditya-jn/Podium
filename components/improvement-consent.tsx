"use client";

import { useId, useState } from "react";
import {
  createImprovementPayload,
  type SelfRating,
} from "@/lib/telemetry/improvement";
import type { GesturePostureMetrics } from "@/lib/vision/aggregation";

type Props = {
  mode: "speak" | "write";
  topicCategory: string;
  difficulty: "easy" | "medium" | "hard";
  durationSeconds: number;
  wordCount: number;
  paceWpm: number;
  deliveryMetrics?: GesturePostureMetrics;
};

export default function ImprovementConsent({
  mode,
  topicCategory,
  difficulty,
  durationSeconds,
  wordCount,
  paceWpm,
  deliveryMetrics,
}: Props) {
  // Opt-in is strictly OFF by default
  const [optedIn, setOptedIn] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [clarity, setClarity] = useState<number>(3);
  const [pacing, setPacing] = useState<number>(3);
  const [eyeContact, setEyeContact] = useState<number>(3);
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);

  const consentCheckboxId = useId();

  const selfRating: SelfRating = { clarity, pacing, eyeContact };

  const currentPayload = createImprovementPayload({
    mode,
    topicCategory,
    difficulty,
    durationSeconds,
    wordCount,
    paceWpm,
    selfRating,
    deliveryMetrics:
      deliveryMetrics && !deliveryMetrics.notEnoughData
        ? {
            facePresencePercent: deliveryMetrics.facePresencePercent,
            gazeTowardCameraPercent: deliveryMetrics.gazeTowardCameraPercent,
            headStabilityPercent: deliveryMetrics.headStabilityPercent,
            browMovementVariety: deliveryMetrics.browMovementVariety,
            smileFrequencyPerMinute: deliveryMetrics.smileFrequencyPerMinute,
            mouthActivity: deliveryMetrics.mouthActivity,
            blinkRatePerMinute: deliveryMetrics.blinkRatePerMinute,
            segments: deliveryMetrics.segments,
          }
        : undefined,
  });

  function handleSimulatedSubmit() {
    // Store nothing yet — this is groundwork mode
    setSubmittedStatus(
      "Telemetry payload generated successfully. In this groundwork release, no external storage or server transmission is performed."
    );
  }

  return (
    <section className="improvement-section" aria-labelledby="improvement-title">
      <div className="improvement-header">
        <div>
          <span className="step-pill"><span>OPT-IN</span> &nbsp; TELEMETRY GROUNDWORK</span>
          <h3 id="improvement-title">Rate your session & help improve Podium</h3>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => setShowConsentModal(true)}
          aria-haspopup="dialog"
        >
          {optedIn ? "✓ Opted in (Telemetry details)" : "Learn about data collection"}
        </button>
      </div>

      <p className="improvement-description">
        Rate how you felt about your delivery. If you choose to opt in, anonymized aggregate metrics and your rating help benchmark speech heuristics.
      </p>

      {/* Self-Rating UI */}
      <div className="self-rating-grid" role="group" aria-label="Self-rating scale from 1 to 5">
        <div className="rating-row">
          <label id="rating-clarity-label">Clarity</label>
          <div className="rating-pills" role="radiogroup" aria-labelledby="rating-clarity-label">
            {[1, 2, 3, 4, 5].map((val) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={clarity === val}
                className={`rating-pill ${clarity === val ? "active" : ""}`}
                onClick={() => {
                  setClarity(val);
                  setSubmittedStatus(null);
                }}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        <div className="rating-row">
          <label id="rating-pacing-label">Pacing</label>
          <div className="rating-pills" role="radiogroup" aria-labelledby="rating-pacing-label">
            {[1, 2, 3, 4, 5].map((val) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={pacing === val}
                className={`rating-pill ${pacing === val ? "active" : ""}`}
                onClick={() => {
                  setPacing(val);
                  setSubmittedStatus(null);
                }}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        <div className="rating-row">
          <label id="rating-eye-contact-label">Eye contact</label>
          <div className="rating-pills" role="radiogroup" aria-labelledby="rating-eye-contact-label">
            {[1, 2, 3, 4, 5].map((val) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={eyeContact === val}
                className={`rating-pill ${eyeContact === val ? "active" : ""}`}
                onClick={() => {
                  setEyeContact(val);
                  setSubmittedStatus(null);
                }}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Opt-in Toggle (OFF by default) */}
      <div className="improvement-consent-toggle">
        <label htmlFor={consentCheckboxId} className="consent-checkbox-label">
          <input
            id={consentCheckboxId}
            type="checkbox"
            checked={optedIn}
            onChange={(e) => {
              setOptedIn(e.target.checked);
              setSubmittedStatus(null);
            }}
          />
          <span>
            <b>Help improve Podium</b>: Share anonymized aggregate metrics and my self-rating (OFF by default).
          </span>
        </label>
      </div>

      {/* Action controls & Payload Inspector */}
      <div className="improvement-actions">
        {optedIn ? (
          <button
            type="button"
            className="camera-primary-button"
            onClick={handleSimulatedSubmit}
          >
            Submit anonymous rating (Groundwork mode)
          </button>
        ) : (
          <p className="opted-out-note">
            Opt-in is currently turned off. No telemetry data is sent.
          </p>
        )}

        <button
          type="button"
          className="text-button"
          onClick={() => setShowPayloadPreview((prev) => !prev)}
        >
          {showPayloadPreview ? "Hide data format preview" : "Inspect anonymized data format (JSON)"}
        </button>
      </div>

      {submittedStatus && (
        <p className="improvement-status-message" role="status">
          {submittedStatus}
        </p>
      )}

      {/* Data Format Inspector */}
      {showPayloadPreview && (
        <div className="payload-preview-box">
          <div className="payload-header">
            <strong>Anonymized Telemetry Format (Zero PII, Zero Text, Zero Video)</strong>
            <span>Groundwork schema: valid</span>
          </div>
          <pre>{JSON.stringify(currentPayload, null, 2)}</pre>
        </div>
      )}

      {/* Consent Details Modal */}
      {showConsentModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-modal-title">
          <div className="modal-card">
            <h4 id="consent-modal-title">Help Improve Podium: Data Collection Groundwork</h4>
            <p>
              When enabled, Podium collects high-level benchmark numbers to improve scoring algorithms and delivery analysis accuracy.
            </p>
            <div className="consent-guarantees">
              <strong>Our strict privacy guarantees:</strong>
              <ul>
                <li><b>Zero speech transcripts or text</b>: Your spoken words and written responses are NEVER shared.</li>
                <li><b>Zero media</b>: Audio recordings, camera images, and facial landmark coordinates are NEVER transmitted.</li>
                <li><b>Zero accounts</b>: No emails, user names, or device identifiers are attached. Each payload uses a one-time random session UUID.</li>
                <li><b>Only aggregate scalars</b>: Only numbers (e.g. word count, speaking pace, gaze %, stability %) and your 1–5 self-rating.</li>
              </ul>
            </div>
            <p className="modal-storage-note">
              <i>Note: In this implementation phase, no external database or storage bucket is connected yet. This UI establishes the consent interface, self-rating capture, and data schema.</i>
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="camera-primary-button"
                onClick={() => {
                  setOptedIn(true);
                  setShowConsentModal(false);
                }}
              >
                Opt in to help improve Podium
              </button>
              <button
                type="button"
                className="camera-secondary-button"
                onClick={() => setShowConsentModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
