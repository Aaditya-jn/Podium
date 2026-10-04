import { describe, expect, it, vi } from "vitest";
import { attachRecognitionRecovery, classifyRecognitionError, detectSpeechEnvironment, planRecognitionRestart } from "@/lib/speech/recovery";

describe("speech recognition recovery", () => {
  it.each(["network", "service-not-allowed", "not-allowed", "audio-capture"])("stops on %s", (code) => {
    const outcome = classifyRecognitionError(code);
    expect(outcome.kind).toBe("fatal");
    expect(outcome.message).toMatch(/Chrome or Edge/);
  });

  it("treats no-speech as a recoverable error", () => {
    expect(classifyRecognitionError("no-speech").kind).toBe("benign");
  });

  it("caps automatic restarts at three within a rolling ten-second window", () => {
    const first = planRecognitionRestart([], 0, true);
    const second = planRecognitionRestart(first.restarts, 100, true);
    const third = planRecognitionRestart(second.restarts, 200, true);
    const fourth = planRecognitionRestart(third.restarts, 300, true);
    expect([first.restart, second.restart, third.restart]).toEqual([true, true, true]);
    expect(fourth).toMatchObject({ restart: false, capped: true });
    expect(planRecognitionRestart(fourth.restarts, 10_300, true).restart).toBe(true);
    expect(planRecognitionRestart([], 500, false).restart).toBe(false);
  });

  it("marks Brave and missing recognition as likely unsupported", () => {
    expect(detectSpeechEnvironment({ hasRecognition: true, hasMediaRecorder: true, isBrave: true })).toMatchObject({ likelyUnsupported: true, fallbackAvailable: true });
    expect(detectSpeechEnvironment({ hasRecognition: false, hasMediaRecorder: true, isBrave: false })).toMatchObject({ likelyUnsupported: true, fallbackAvailable: true });
  });

  it("does not restart a mocked SpeechRecognition after a fatal network error", () => {
    const engine = { onend: null as (() => void) | null, onerror: null as ((event: { error: string }) => void) | null, start: vi.fn() };
    let recording = true;
    const scheduled: (() => void)[] = [];
    const onFatal = vi.fn(() => { recording = false; });
    attachRecognitionRecovery({ engine, isRecording: () => recording, restarts: [], now: () => 0, schedule: (callback) => { scheduled.push(callback); return callback; }, cancelSchedule: vi.fn(), onBenign: vi.fn(), onFatal, onRestartCap: vi.fn() });
    engine.onerror?.({ error: "network" });
    engine.onend?.();
    expect(onFatal).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(0);
    expect(engine.start).not.toHaveBeenCalled();
  });

  it("restarts a mocked SpeechRecognition three times and stops on the fourth end", () => {
    const engine = { onend: null as (() => void) | null, onerror: null as ((event: { error: string }) => void) | null, start: vi.fn() };
    const scheduled: (() => void)[] = [];
    const onRestartCap = vi.fn();
    let now = 0;
    attachRecognitionRecovery({ engine, isRecording: () => true, restarts: [], now: () => now, schedule: (callback) => { scheduled.push(callback); return callback; }, cancelSchedule: vi.fn(), onBenign: vi.fn(), onFatal: vi.fn(), onRestartCap });
    for (let index = 0; index < 4; index += 1) {
      engine.onend?.();
      if (scheduled.length) scheduled.shift()?.();
      now += 100;
    }
    expect(engine.start).toHaveBeenCalledTimes(3);
    expect(onRestartCap).toHaveBeenCalledOnce();
  });
});
