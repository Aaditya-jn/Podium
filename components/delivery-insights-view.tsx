"use client";

import type { GesturePostureMetrics } from "@/lib/vision/aggregation";

type CoachingData = {
  observations: string[];
  exercises: string[];
  strength: string;
  fallback?: boolean;
};

type Props = {
  metrics: GesturePostureMetrics;
  coaching?: CoachingData;
};

export default function DeliveryInsightsView({ metrics, coaching }: Props) {
  if (metrics.notEnoughData) {
    return (
      <section className="delivery-results" aria-labelledby="delivery-signals-heading">
        <div className="delivery-header">
          <div>
            <p className="camera-eyebrow">OPTIONAL · NOT SCORED</p>
            <h3 id="delivery-signals-heading">Camera delivery signals</h3>
          </div>
          <span className="delivery-status-pill neutral" role="status">Not enough data</span>
        </div>
        <div className="delivery-not-enough-data">
          <p>
            Session duration was under 8 seconds or camera detection quality was too low to establish a reliable baseline calibration.
          </p>
          <small>
            For delivery insights, ensure front-facing lighting, keep your camera at eye level, and speak for at least 8 seconds.
          </small>
        </div>
        <p className="delivery-caveat">
          Measurements are strictly observable physical cues and never claim emotion, nervousness, confidence, or personality. Lighting, glasses, camera angle, and individual or cultural differences affect camera detection.
        </p>
      </section>
    );
  }

  return (
    <section className="delivery-results" aria-labelledby="delivery-signals-heading">
      <div className="delivery-header">
        <div>
          <p className="camera-eyebrow">OPTIONAL · NOT SCORED</p>
          <h3 id="delivery-signals-heading">Camera delivery signals</h3>
        </div>
        <span className="delivery-status-pill active" role="status">Calibrated to 3s baseline</span>
      </div>

      <p className="delivery-subtitle">
        Observable physical cues calibrated against your own neutral first 3 seconds. Kept completely separate from your 0–100 practice score.
      </p>

      {/* 7 Descriptive Cues Grid */}
      <div className="delivery-metrics-grid">
        <div className="delivery-metric-card">
          <span className="metric-label">Gaze toward camera</span>
          <strong className="metric-value">{metrics.gazeTowardCameraPercent}%</strong>
          <span className="metric-detail">alignment with camera baseline</span>
        </div>
        <div className="delivery-metric-card">
          <span className="metric-label">Head stability</span>
          <strong className="metric-value">{metrics.headStabilityPercent}%</strong>
          <span className="metric-detail">orientation consistency</span>
        </div>
        <div className="delivery-metric-card">
          <span className="metric-label">Brow movement variety</span>
          <strong className="metric-value">{metrics.browMovementVariety}</strong>
          <span className="metric-detail">range relative to baseline</span>
        </div>
        <div className="delivery-metric-card">
          <span className="metric-label">Smile frequency</span>
          <strong className="metric-value">{metrics.smileFrequencyPerMinute} <small>/min</small></strong>
          <span className="metric-detail">expression transitions</span>
        </div>
        <div className="delivery-metric-card">
          <span className="metric-label">Speaking cadence</span>
          <strong className="metric-value">{metrics.mouthActivity}</strong>
          <span className="metric-detail">mouth activity index</span>
        </div>
        <div className="delivery-metric-card">
          <span className="metric-label">Blink rate</span>
          <strong className="metric-value">{metrics.blinkRatePerMinute} <small>/min</small></strong>
          <span className="metric-detail">blinks per minute</span>
        </div>
        <div className="delivery-metric-card">
          <span className="metric-label">Face visibility</span>
          <strong className="metric-value">{metrics.facePresencePercent}%</strong>
          <span className="metric-detail">frames in frame</span>
        </div>
      </div>

      {/* Per-Segment Timeline */}
      {metrics.segments.length > 0 && (
        <div className="delivery-timeline-section">
          <h4>Delivery timeline ({metrics.segments.length} segments)</h4>
          <p className="timeline-caption">See how your observable signals shifted from beginning to end of your talk:</p>
          <div className="timeline-grid">
            {metrics.segments.map((seg, index) => (
              <div className="timeline-card" key={index}>
                <div className="timeline-card-header">
                  <strong>{seg.label}</strong>
                  <span>{seg.faceVisibilityPercent !== null ? `${seg.faceVisibilityPercent}% face` : "No data"}</span>
                </div>
                <div className="timeline-stats">
                  <div>
                    <span>Gaze toward lens</span>
                    <b>{seg.gazeTowardCameraPercent !== null ? `${seg.gazeTowardCameraPercent}%` : "—"}</b>
                  </div>
                  <div>
                    <span>Head stability</span>
                    <b>{seg.headStabilityPercent !== null ? `${seg.headStabilityPercent}%` : "—"}</b>
                  </div>
                  <div>
                    <span>Mouth cadence</span>
                    <b>{seg.mouthActivity !== null ? seg.mouthActivity : "—"}</b>
                  </div>
                  <div>
                    <span>Smile / min</span>
                    <b>{seg.smileFrequencyPerMinute !== null ? seg.smileFrequencyPerMinute : "—"}</b>
                  </div>
                  <div>
                    <span>Blink / min</span>
                    <b>{seg.blinkRatePerMinute !== null ? seg.blinkRatePerMinute : "—"}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gemini Delivery Coaching */}
      {coaching && (
        <div className="delivery-coaching-section">
          <div className="coaching-header">
            <h4>Delivery coaching</h4>
            <span className="coaching-badge">{coaching.fallback ? "Standard coach" : "AI coach"}</span>
          </div>

          <div className="coaching-strength-card">
            <span>OBSERVABLE STRENGTH</span>
            <p>{coaching.strength}</p>
          </div>

          <div className="coaching-columns">
            <div className="coaching-block">
              <h5>Observations (citing your numbers)</h5>
              <ul>
                {coaching.observations.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="coaching-block">
              <h5>Practice exercises</h5>
              <ul>
                {coaching.exercises.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <p className="delivery-caveat">
        Note: These measurements describe observable physical behavior only. They never claim emotion, nervousness, confidence, engagement, honesty, or personality. Lighting, glasses, camera angle, hardware, and individual and cultural differences naturally affect camera measurements. These metrics do not affect your 0–100 practice score.
      </p>
    </section>
  );
}
