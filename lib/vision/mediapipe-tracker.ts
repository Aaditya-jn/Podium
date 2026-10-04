import type { DeliveryTracker, VisionSample } from "@/lib/vision/types";

const TASKS_VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const SAMPLE_INTERVAL_MS = 100;

type MediaPipeModule = typeof import("@mediapipe/tasks-vision");
type Tasks = {
  face: import("@mediapipe/tasks-vision").FaceLandmarker;
  hands: import("@mediapipe/tasks-vision").HandLandmarker;
  pose: import("@mediapipe/tasks-vision").PoseLandmarker;
};
type Point = { x: number; y: number };

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function closeTasks(tasks: Partial<Tasks>) {
  tasks.face?.close();
  tasks.hands?.close();
  tasks.pose?.close();
}

async function createTasks(vision: MediaPipeModule, fileset: Awaited<ReturnType<MediaPipeModule["FilesetResolver"]["forVisionTasks"]>>, delegate: "GPU" | "CPU"): Promise<Tasks> {
  const tasks: Partial<Tasks> = {};
  try {
    tasks.face = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    tasks.hands = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
    });
    tasks.pose = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      outputSegmentationMasks: false,
    });
    return tasks as Tasks;
  } catch (error) {
    closeTasks(tasks);
    throw error;
  }
}

export class MediaPipeDeliveryTracker implements DeliveryTracker {
  private tasks: Tasks | null = null;
  private listeners = new Set<(sample: VisionSample) => void>();
  private frameRequest = 0;
  private running = false;
  private lastSampleAt = 0;
  private lastVideoTime = -1;
  private previousHandWrists: Point[] = [];
  private generation = 0;

  onSample(listener: (sample: VisionSample) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(video: HTMLVideoElement) {
    if (this.running) return;
    const generation = ++this.generation;
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(TASKS_VISION_WASM);
    try {
      this.tasks = await createTasks(vision, fileset, "GPU");
    } catch {
      // Some browsers/devices don't support the GPU delegate; retry locally on CPU.
      this.tasks = await createTasks(vision, fileset, "CPU");
    }

    if (generation !== this.generation) {
      closeTasks(this.tasks);
      this.tasks = null;
      return;
    }

    this.running = true;
    this.lastVideoTime = -1;
    const loop = (now: number) => {
      if (!this.running) return;
      if (document.visibilityState === "visible"
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && video.currentTime !== this.lastVideoTime
        && now - this.lastSampleAt >= SAMPLE_INTERVAL_MS) {
        this.lastSampleAt = now;
        this.lastVideoTime = video.currentTime;
        const timestamp = Math.round(performance.now());
        try {
          const sample = this.sample(video, timestamp);
          for (const listener of this.listeners) {
            try { listener(sample); } catch { /* A consumer error must not break local tracking. */ }
          }
        } catch {
          // A bad frame can be skipped; keep the preview and future samples alive.
        }
      }
      this.frameRequest = requestAnimationFrame(loop);
    };
    this.frameRequest = requestAnimationFrame(loop);
  }

  stop() {
    this.generation += 1;
    this.running = false;
    cancelAnimationFrame(this.frameRequest);
    closeTasks(this.tasks ?? {});
    this.tasks = null;
    this.previousHandWrists = [];
    this.lastVideoTime = -1;
  }

  private sample(video: HTMLVideoElement, timestamp: number): VisionSample {
    if (!this.tasks) throw new Error("Vision tracker has not started");
    const faceResult = this.tasks.face.detectForVideo(video, timestamp);
    const handResult = this.tasks.hands.detectForVideo(video, timestamp);
    const poseResult = this.tasks.pose.detectForVideo(video, timestamp);

    const wrists = (handResult.landmarks ?? []).flatMap((landmarks) => {
      const wrist = landmarks[0];
      return wrist ? [{ x: wrist.x, y: wrist.y }] : [];
    });
    const handDeltaX = average(wrists.map((point, index) => point.x - (this.previousHandWrists[index]?.x ?? point.x)));
    const handDeltaY = average(wrists.map((point, index) => point.y - (this.previousHandWrists[index]?.y ?? point.y)));
    this.previousHandWrists = wrists.map(({ x, y }) => ({ x, y }));

    const handedness = handResult.handedness ?? [];
    const handConfidence = average(handedness.map((categories) => categories[0]?.score ?? 0));
    const pose = poseResult.landmarks?.[0] ?? [];
    const requiredPoints = [pose[11], pose[12], pose[23], pose[24]];
    const poseConfidence = average(requiredPoints.map((point) => point?.visibility ?? 0));
    const leftShoulder = pose[11];
    const rightShoulder = pose[12];
    const leftHip = pose[23];
    const rightHip = pose[24];
    const hasPose = requiredPoints.every(Boolean);

    let shoulderTiltDegrees: number | null = null;
    let torsoLeanDegrees: number | null = null;
    let shoulderDepth: number | null = null;
    if (hasPose && leftShoulder && rightShoulder && leftHip && rightHip) {
      shoulderTiltDegrees = Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) * 180 / Math.PI;
      const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      const hipX = (leftHip.x + rightHip.x) / 2;
      const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const hipY = (leftHip.y + rightHip.y) / 2;
      torsoLeanDegrees = Math.atan2(shoulderX - hipX, Math.abs(hipY - shoulderY)) * 180 / Math.PI;
      shoulderDepth = (leftShoulder.z + rightShoulder.z - leftHip.z - rightHip.z) / 2;
    }

    return {
      timestamp,
      facePresent: (faceResult.faceLandmarks?.length ?? 0) > 0,
      handsPresent: wrists.length > 0,
      handConfidence,
      handDeltaX,
      handDeltaY,
      shoulderTiltDegrees,
      torsoLeanDegrees,
      shoulderDepth,
      poseConfidence: hasPose ? poseConfidence : 0,
    };
  }
}

export function createDeliveryTracker(): DeliveryTracker {
  return new MediaPipeDeliveryTracker();
}
