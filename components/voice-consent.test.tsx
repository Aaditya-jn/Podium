// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VoiceConsent from "@/components/voice-consent";

function installAudioMock() {
  const stopTrack = vi.fn();
  const close = vi.fn(async () => undefined);
  const analyser = {
    fftSize: 2_048,
    smoothingTimeConstant: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(0.004),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  class FakeAudioContext {
    sampleRate = 48_000;
    state = "running";
    createMediaStreamSource() { return source; }
    createAnalyser() { return analyser; }
    resume = vi.fn(async () => undefined);
    close = close;
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return { stopTrack, close };
}

function fakeStream(stopTrack: () => void) {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

function enableVoice(recording: boolean, sharedStream: MediaStream | null, onMetrics = () => undefined) {
  const view = render(
    <VoiceConsent recording={recording} transcript="" sharedStream={sharedStream} onMetrics={onMetrics} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Set up voice analysis" }));
  fireEvent.click(screen.getByRole("button", { name: "Enable voice analysis" }));
  return view;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("VoiceConsent component", () => {
  it("does not ask for microphone permission until recording starts", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const audio = installAudioMock();
    const getUserMedia = vi.fn();
    const stream = fakeStream(audio.stopTrack);
    getUserMedia.mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });

    const { rerender, unmount } = enableVoice(false, null);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Pauses/ })).toBeTruthy();

    rerender(<VoiceConsent recording transcript="" sharedStream={null} onMetrics={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });

    await act(async () => { vi.advanceTimersByTime(120); });
    unmount();
    expect(audio.close).toHaveBeenCalled();
    expect(audio.stopTrack).toHaveBeenCalled();
  });

  it("lets the user opt out of individual voice signals", () => {
    installAudioMock();
    render(<VoiceConsent recording={false} transcript="" sharedStream={null} onMetrics={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Set up voice analysis" }));

    for (const label of [/Pauses/, /Volume/, /Pitch variety/, /Pace over time/, /Filler words/]) {
      fireEvent.click(screen.getByRole("checkbox", { name: label }));
    }
    expect((screen.getByRole("button", { name: "Enable voice analysis" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("reuses the MediaRecorder stream instead of requesting another microphone", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const audio = installAudioMock();
    const getUserMedia = vi.fn();
    const sharedStream = fakeStream(audio.stopTrack);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });

    const { rerender, unmount } = enableVoice(false, sharedStream);
    rerender(<VoiceConsent recording transcript="" sharedStream={sharedStream} onMetrics={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    unmount();
    expect(audio.close).toHaveBeenCalled();
    expect(audio.stopTrack).not.toHaveBeenCalled();
  });
});
