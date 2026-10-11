import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveFileset: vi.fn(),
  createFace: vi.fn(),
  faceDetect: vi.fn(),
  closeFace: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mocks.resolveFileset },
  FaceLandmarker: { createFromOptions: mocks.createFace },
}));

import { MediaPipeDeliveryTracker } from "@/lib/vision/mediapipe-tracker";

function mockTask(detectForVideo: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn>) {
  return { detectForVideo, close };
}

function setupMediaPipeMocks() {
  mocks.resolveFileset.mockResolvedValue({});
  mocks.faceDetect.mockReturnValue({
    faceLandmarks: [[{ x: 0.5, y: 0.5 }]],
    faceBlendshapes: [{
      categories: [
        { categoryName: "eyeLookInLeft", score: 0.1 },
        { categoryName: "browInnerUp", score: 0.2 },
        { categoryName: "mouthSmileLeft", score: 0.3 },
        { categoryName: "jawOpen", score: 0.4 },
        { categoryName: "eyeBlinkLeft", score: 0.05 },
      ],
    }],
    facialTransformationMatrixes: [{
      data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    }],
  });
  mocks.createFace.mockResolvedValue(mockTask(mocks.faceDetect, mocks.closeFace));
}

describe("MediaPipe delivery tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMediaPipeMocks();
  });

  it("lazily loads local task adapters and emits derived samples instead of landmark arrays", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const tracker = new MediaPipeDeliveryTracker();
    const onSample = vi.fn();
    tracker.onSample(onSample);
    const video = { readyState: 2, currentTime: 1 } as HTMLVideoElement;
    await tracker.start(video);
    frames.shift()?.(performance.now() + 120);

    expect(mocks.resolveFileset).toHaveBeenCalledOnce();
    expect(mocks.createFace.mock.calls[0]?.[1].baseOptions.delegate).toBe("GPU");
    expect(mocks.createFace.mock.calls[0]?.[1].outputFaceBlendshapes).toBe(true);
    expect(mocks.createFace.mock.calls[0]?.[1].outputFacialTransformationMatrixes).toBe(true);
    expect(onSample).toHaveBeenCalledOnce();
    expect(onSample.mock.calls[0]?.[0]).toMatchObject({
      facePresent: true,
      faceConfidence: 1,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
    });
    expect(onSample.mock.calls[0]?.[0]).not.toHaveProperty("faceLandmarks");
    expect(onSample.mock.calls[0]?.[0]).not.toHaveProperty("landmarks");
    tracker.stop();
    expect(mocks.closeFace).toHaveBeenCalledOnce();
  });

  it("recreates tasks with the CPU delegate when GPU initialization fails", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.createFace.mockImplementation(async (_fileset: unknown, options: { baseOptions: { delegate: string } }) => {
      if (options.baseOptions.delegate === "GPU") throw new Error("GPU is unavailable");
      return mockTask(mocks.faceDetect, mocks.closeFace);
    });

    const tracker = new MediaPipeDeliveryTracker();
    await tracker.start({ readyState: 2, currentTime: 1 } as HTMLVideoElement);
    expect(mocks.createFace.mock.calls.map((call) => call[1].baseOptions.delegate)).toEqual(["GPU", "CPU"]);
    tracker.stop();
  });
});
