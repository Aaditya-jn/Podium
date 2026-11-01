"use client";

import type { VoiceMetrics } from "@/lib/audio/types";
import type { GesturePostureMetrics } from "@/lib/vision/aggregation";

type CoachingData = {
  observations: string[];
  exercises: string[];
  strength: string;
  fallback?: boolean;
};

type Props = {
  metrics?: GesturePostureMetrics;
  voice?: VoiceMetrics;
  coaching?: CoachingData;
};

function volumeText(voice: VoiceMetrics) {
  if (voice.tooQuiet) return "signal is quiet relative to the noise floor";
  if (voice.trailingOffCount && voice.trailingOffCount > 0) return `level dropped at the end of ${voice.trailingOffCount} run${voice.trailingOffCount === 1 ? "" : "s"}`;
  return "few end-of-run drops";
}

function paceText(voice: VoiceMetrics) {
  if (voice.paceTrend === "faster") return "pace increased across the talk";
  if (voice.paceTrend === "slower") return "pace decreased across the talk";
  return "pace stayed broadly steady";
}

export default function DeliveryInsightsView({ metrics, voice, coaching }: Props) {
  const cameraAvailable = Boolean(metrics && !metrics.notEnoughData);
  const voiceAvailable = Boolean(voice && !voice.notEnoughData);
  const segmentCount = metrics?.segments.length || voice?.segments.length || 0;

  if (!cameraAvailable && !voiceAvailable) {
    return (
      <section className="delivery-results" aria-labelledby="delivery-signals-heading">
        <div className="delivery-header">
          <div>
            <p className="camera-eyebrow">OPTIONAL · NOT SCORED</p>
            <h3 id="delivery-signals-heading">Delivery signals</h3>
          </div>
          <span className="delivery-status-pill neutral" role="status">Not enough data</span>
        </div>
        <div className="delivery-not-enough-data">
          <p>Session duration was under 8 seconds or signal quality was too low to establish a reliable baseline.</p>
          <small>
            Voice delivery needs at least 8 seconds of analysable speech after a 2.5-second noise-floor calibration. Camera delivery needs a clear view for its 3-second baseline.
          </small>
        </div>
        <p className="delivery-caveat">
          Measurements are strictly observable and never claim emotion, nervousness, confidence, honesty, or personality. Microphones, background noise, lighting, glasses, camera angle, accents, and individual differences affect measurements. These metrics do not affect your 0–100 practice score.
        </p>
      </section>
    );
  }

  return (
    <section className="delivery-results" aria-labelledby="delivery-signals-heading">
      <div className="delivery-header">
        <div>
          <p className="camera-eyebrow">OPTIONAL · NOT SCORED</p>
          <h3 id="delivery-signals-heading">Delivery signals</h3>
        </div>
        <span className="delivery-status-pill active" role="status">Calibrated to your own baseline</span>
      </div>

      <p className="delivery-subtitle">
        Observable delivery cues only, calibrated against your own opening seconds and kept completely separate from your 0–100 practice score.
      </p>

      {metrics && (
        <div className="delivery-group">
          <div className="delivery-group-heading">
            <h4>Camera signals</h4>
            {!cameraAvailable && <span className="delivery-status-pill neutral">Not enough data</span>}
          </div>
          {!cameraAvailable ? (
            <div className="delivery-not-enough-data compact">
              <p>Camera detection quality was too low, or the session was too short after the 3-second baseline.</p>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {voice && (
        <div className="delivery-group">
          <div className="delivery-group-heading">
            <h4>Voice signals</h4>
            {!voiceAvailable && <span className="delivery-status-pill neutral">Not enough data</span>}
          </div>
          {!voiceAvailable ? (
            <div className="delivery-not-enough-data compact">
              <p>
                Voice analysis needs at least 8 seconds of speech after calibration, or the microphone signal was too quiet relative to the noise floor.
              </p>
              <small>Sound level and speech detection are affected by microphone type, distance, room noise, and accents.</small>
            </div>
          ) : (
            <>
              <div className="delivery-metrics-grid voice-metrics-grid">
                {voice.signals.pauses && (
                  <div className="delivery-metric-card">
                    <span className="metric-label">Pauses</span>
                    <strong className="metric-value">{voice.pauseCount}</strong>
                    <span className="metric-detail">
                      {voice.shortPauseCount} short · {voice.longPauseCount} long · longest {voice.longestPauseSeconds}s
                    </span>
                  </div>
                )}
                {voice.signals.pauses && (
                  <div className="delivery-metric-card">
                    <span className="metric-label">Silent time</span>
                    <strong className="metric-value">{voice.silentPercent}%</strong>
                    <span className="metric-detail">average pause {voice.averagePauseSeconds}s</span>
                  </div>
                )}
                {voice.signals.volume && (
                  <div className="delivery-metric-card">
                    <span className="metric-label">Volume variation</span>
                    <strong className="metric-value">{voice.volumeVariationDb} <small>dB</small></strong>
                    <span className="metric-detail">{volumeText(voice)}</span>
                  </div>
                )}
                {voice.signals.pitch && (
                  <div className="delivery-metric-card">
                    <span className="metric-label">Pitch variety</span>
                    <strong className="metric-value">{voice.pitchMedianHz} <small>Hz</small></strong>
                    <span className="metric-detail">{voice.pitchVariety} · {voice.pitchRangeSemitones} semitone range</span>
                  </div>
                )}
                {voice.signals.pace && (
                  <div className="delivery-metric-card">
                    <span className="metric-label">Pace over time</span>
                    <strong className="metric-value">{voice.wordsPerMinute} <small>wpm</small></strong>
                    <span className="metric-detail">{paceText(voice)} · {voice.speechActivityPercent}% speech activity</span>
                  </div>
                )}
                {voice.signals.fillers && (
                  <div className="delivery-metric-card">
                    <span className="metric-label">Filler words <small>(approx.)</small></span>
                    <strong className="metric-value">{voice.fillerCount}</strong>
                    <span className="metric-detail">{voice.fillerRatePerMinute}/min · browser transcription may drop “um” and “uh”</span>
                  </div>
                )}
              </div>
              {voice.tooQuiet && (
                <p className="voice-warning" role="status">
                  Your voice registered close to the background-noise level. Move closer to the microphone or speak a little louder for more reliable measurements.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {segmentCount > 0 && (cameraAvailable || voiceAvailable) && (
        <div className="delivery-timeline-section">
          <h4>Delivery timeline ({segmentCount} segments)</h4>
          <p className="timeline-caption">See how observable camera and voice signals shifted from beginning to end of your talk:</p>
          <div className="timeline-grid">
            {Array.from({ length: segmentCount }, (_, index) => {
              const camera = cameraAvailable ? metrics?.segments[index] : undefined;
              const voiceSegment = voiceAvailable ? voice?.segments[index] : undefined;
              return (
                <div className="timeline-card" key={index}>
                  <div className="timeline-card-header">
                    <strong>{camera?.label ?? voiceSegment?.label ?? `Part ${index + 1}`}</strong>
                    <span>{voiceSegment?.analyzedSeconds !== undefined ? `${voiceSegment.analyzedSeconds}s` : camera?.faceVisibilityPercent !== null && camera ? `${camera.faceVisibilityPercent}% face` : "—"}</span>
                  </div>
                  <div className="timeline-stats">
                    {camera && (
                      <>
                        <div><span>Gaze toward lens</span><b>{camera.gazeTowardCameraPercent !== null ? `${camera.gazeTowardCameraPercent}%` : "—"}</b></div>
                        <div><span>Head stability</span><b>{camera.headStabilityPercent !== null ? `${camera.headStabilityPercent}%` : "—"}</b></div>
                        <div><span>Mouth cadence</span><b>{camera.mouthActivity !== null ? camera.mouthActivity : "—"}</b></div>
                        <div><span>Smile / min</span><b>{camera.smileFrequencyPerMinute !== null ? camera.smileFrequencyPerMinute : "—"}</b></div>
                        <div><span>Blink / min</span><b>{camera.blinkRatePerMinute !== null ? camera.blinkRatePerMinute : "—"}</b></div>
                      </>
                    )}
                    {voiceSegment && voice?.signals.pauses && (
                      <>
                        <div><span>Pauses</span><b>{voiceSegment.pauseCount !== null ? `${voiceSegment.pauseCount} (${voiceSegment.longPauseCount ?? 0} long)` : "—"}</b></div>
                        <div><span>Silent time</span><b>{voiceSegment.silentPercent !== null ? `${voiceSegment.silentPercent}%` : "—"}</b></div>
                      </>
                    )}
                    {voiceSegment && voice?.signals.volume && (
                      <>
                        <div><span>Volume variation</span><b>{voiceSegment.volumeVariationDb !== null ? `${voiceSegment.volumeVariationDb} dB` : "—"}</b></div>
                        <div><span>Trailing off</span><b>{voiceSegment.trailingOffCount !== null ? voiceSegment.trailingOffCount : "—"}</b></div>
                      </>
                    )}
                    {voiceSegment && voice?.signals.pitch && (
                      <div><span>Pitch variety</span><b>{voiceSegment.pitchVarietySemitones !== null ? `${voiceSegment.pitchVarietySemitones} st` : "—"}</b></div>
                    )}
                    {voiceSegment && voice?.signals.pace && (
                      <div>
                        <span>Pace</span>
                        <b>{voiceSegment.paceWpm !== null ? `${voiceSegment.paceWpm} wpm${voiceSegment.paceFlag ? ` (${voiceSegment.paceFlag})` : ""}` : "—"}</b>
                      </div>
                    )}
                    {voiceSegment && voice?.signals.fillers && (
                      <div><span>Fillers</span><b>{voiceSegment.fillerCount !== null ? `${voiceSegment.fillerCount} · ${voiceSegment.fillerRatePerMinute}/min` : "—"}</b></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
        Note: These measurements describe observable behavior only. They never claim emotion, nervousness, confidence, engagement, honesty, or personality. Microphones, background noise, room acoustics, accents, lighting, glasses, and camera angles naturally affect measurements. Filler counts are approximate because browser transcription often drops “um” and “uh”. These metrics do not affect your 0–100 practice score.
      </p>
    </section>
  );
}
