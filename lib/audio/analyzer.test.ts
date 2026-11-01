import { afterEach, describe, expect, it, vi } from "vitest";

import { createVoiceAnalyzer } from "@/lib/audio/analyzer";
import { DEFAULT_VOICE_SIGNALS, type VoiceFrame } from "@/lib/audio/types";

type FakeAnalyser = {
  fftSize: number;
  smoothingTimeConstant: number;
  connect: () => void;
  disconnect: () => void;
  getFloatTimeDomainData: (buffer: Float32Array) => void;
};

function installAudioMock(wave: (index: number) => number) {
  const analyser: FakeAnalyser = {
    fftSize: 2_048,
    smoothingTimeConstant: 0,
    connect: () => undefined,
    disconnect: () => undefined,
    getFloatTimeDomainData: (buffer) => {
      for (let index = 0; index < buffer.length; index += 1) buffer[index] = wave(index);
    },
  };
  const close = vi.fn(async () => undefined);
  const resume = vi.fn(async () => undefined);
  const source = { connect: vi.fn(), disconnect: vi.fn() };

  class FakeAudioContext {
    sampleRate = 48_000;
    state = "running";
    createMediaStreamSource() { return source; }
    createAnalyser() { return analyser; }
    resume = resume;
    close = close;
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  return { analyser, close, resume, source };
}

function fakeStream() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  return { stream, stop };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("on-device voice analyzer", () => {
  it("calibrates against a quiet baseline, then reports speech frames", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let speaking = false;
    installAudioMock((index) => (speaking ? 0.2 * Math.sin((2 * Math.PI * 180 * index) / 48_000) : 0.004));
    const { stream } = fakeStream();
    const analyzer = createVoiceAnalyzer({ signals: DEFAULT_VOICE_SIGNALS, sampleIntervalMs: 50, now: () => Date.now() });
    const frames: VoiceFrame[] = [];
    analyzer.onSample((frame) => frames.push(frame));

    await analyzer.start(stream, { ownsStream: true });
    vi.advanceTimersByTime(3_000);
    expect(frames.length).toBeGreaterThan(20);
    expect(frames.some((frame) => !frame.calibrationComplete)).toBe(true);
    expect(frames.some((frame) => frame.calibrationComplete)).toBe(true);

    speaking = true;
    vi.advanceTimersByTime(2_000);
    const analysed = frames.filter((frame) => frame.calibrationComplete);
    expect(analysed.some((frame) => frame.isSpeech)).toBe(true);
    expect(analysed.some((frame) => frame.pitchHz !== null)).toBe(true);
    analyzer.stop();
  });

  it("stops owned tracks and closes the AudioContext on stop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const audio = installAudioMock(() => 0.004);
    const { stream, stop } = fakeStream();
    const analyzer = createVoiceAnalyzer({ signals: DEFAULT_VOICE_SIGNALS, sampleIntervalMs: 50, now: () => Date.now() });

    await analyzer.start(stream, { ownsStream: true });
    analyzer.stop();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(audio.close).toHaveBeenCalledTimes(1);
    expect(audio.source.disconnect).toHaveBeenCalled();
    expect(analyzer.isRunning()).toBe(false);
  });

  it("leaves a shared MediaRecorder stream running when it stops", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    installAudioMock(() => 0.004);
    const { stream, stop } = fakeStream();
    const analyzer = createVoiceAnalyzer({ signals: DEFAULT_VOICE_SIGNALS, sampleIntervalMs: 50, now: () => Date.now() });

    await analyzer.start(stream, { ownsStream: false });
    analyzer.stop();

    expect(stop).not.toHaveBeenCalled();
  });

  it("lowers the sampling rate when frames take too long to process", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    installAudioMock(() => 0.004);
    const { stream } = fakeStream();
    // The second clock read of every tick lands 20 ms later, which simulates
    // expensive frame processing and should trigger the adaptive throttle.
    let reads = 0;
    const now = () => {
      reads += 1;
      return Date.now() + (reads % 2 === 0 ? 20 : 0);
    };
    const analyzer = createVoiceAnalyzer({ signals: DEFAULT_VOICE_SIGNALS, sampleIntervalMs: 33, now });
    let frames = 0;
    analyzer.onSample(() => { frames += 1; });

    await analyzer.start(stream);
    vi.advanceTimersByTime(1_000);
    analyzer.stop();

    expect(frames).toBeLessThan(25);
    expect(frames).toBeGreaterThan(5);
  });

  it("unsubscribes sample listeners", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    installAudioMock(() => 0.004);
    const { stream } = fakeStream();
    const analyzer = createVoiceAnalyzer({ signals: DEFAULT_VOICE_SIGNALS, sampleIntervalMs: 50, now: () => Date.now() });
    let frames = 0;
    const unsubscribe = analyzer.onSample(() => { frames += 1; });
    await analyzer.start(stream);
    vi.advanceTimersByTime(500);
    unsubscribe();
    const afterUnsubscribe = frames;
    vi.advanceTimersByTime(500);
    analyzer.stop();
    expect(frames).toBe(afterUnsubscribe);
  });
});
