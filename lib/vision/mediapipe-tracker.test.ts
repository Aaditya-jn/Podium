import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveFileset: vi.fn(),
  createFace: vi.fn(),
  createHands: vi.fn(),
  createPose: vi.fn(),
  faceDetect: vi.fn(),
  handDetect: vi.fn(),
  poseDetect: vi.fn(),
  closeFace: vi.fn(),
  closeHands: vi.fn(),
  closePose: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mocks.resolveFileset },
  FaceLandmarker: { createFromOptions: mocks.createFace },
  HandLandmarker: { createFromOptions: mocks.createHands },
  PoseLandmarker: { createFromOptions: mocks.createPose },
}));

import { MediaPipeDeliveryTracker } from "@/lib/vision/mediapipe-tracker";

function mockTask(detectForVideo: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn>) {
  return { detectForVideo, close };
}

function setupMediaPipeMocks() {
  mocks.resolveFileset.mockResolvedValue({});
  mocks.faceDetect.mockReturnValue({ faceLandmarks: [[{}]], faceBlendshapes: [], facialTransformationMatrixes: [] });
  mocks.handDetect.mockReturnValue({
    landmarks: [[{ x: 0.2, y: 0.3, z: 0 }]],
    handedness: [[{ score: 0.95 }]],
  });
  const poseLandmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  poseLandmarks[11] = { x: 0.4, y: 0.4, z: 0.1, visibility: 0.9 };
  poseLandmarks[12] = { x: 0.6, y: 0.42, z: 0.1, visibility: 0.9 };
  poseLandmarks[23] = { x: 0.45, y: 0.7, z: 0.2, visibility: 0.9 };
  poseLandmarks[24] = { x: 0.55, y: 0.7, z: 0.2, visibility: 0.9 };
  mocks.poseDetect.mockReturnValue({ landmarks: [poseLandmarks] });
  mocks.createFace.mockResolvedValue(mockTask(mocks.faceDetect, mocks.closeFace));
  mocks.createHands.mockResolvedValue(mockTask(mocks.handDetect, mocks.closeHands));
  mocks.createPose.mockResolvedValue(mockTask(mocks.poseDetect, mocks.closePose));
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
    expect(onSample.mock.calls[0]?.[0]).toMatchObject({ facePresent: true, handsPresent: true, handConfidence: 0.95 });
    expect(onSample.mock.calls[0]?.[0]).not.toHaveProperty("landmarks");
    tracker.stop();
    expect(mocks.closeFace).toHaveBeenCalledOnce();
    expect(mocks.closeHands).toHaveBeenCalledOnce();
    expect(mocks.closePose).toHaveBeenCalledOnce();
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
