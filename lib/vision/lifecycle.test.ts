import { describe, expect, it, vi } from "vitest";
import { shouldRunCameraTracking, stopMediaStreamTracks } from "@/lib/vision/lifecycle";

describe("camera tracking lifecycle", () => {
  it("starts only after consent while recording in a visible page", () => {
    expect(shouldRunCameraTracking({ consented: true, recording: true, pageVisible: true })).toBe(true);
    expect(shouldRunCameraTracking({ consented: false, recording: true, pageVisible: true })).toBe(false);
    expect(shouldRunCameraTracking({ consented: true, recording: false, pageVisible: true })).toBe(false);
    expect(shouldRunCameraTracking({ consented: true, recording: true, pageVisible: false })).toBe(false);
  });

  it("requires a fresh active session after pause, submission, or leaving the page", () => {
    for (const recording of [false]) {
      expect(shouldRunCameraTracking({ consented: true, recording, pageVisible: true })).toBe(false);
    }
    expect(shouldRunCameraTracking({ consented: true, recording: false, pageVisible: false })).toBe(false);
  });

  it("stops every media track during pause, submit, or teardown", () => {
    const videoTrack = { stop: vi.fn() };
    const secondTrack = { stop: vi.fn() };
    stopMediaStreamTracks({ getTracks: () => [videoTrack, secondTrack] } as unknown as MediaStream);
    expect(videoTrack.stop).toHaveBeenCalledOnce();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
  });
});
