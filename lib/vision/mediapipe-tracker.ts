import type { DeliveryTracker, VisionSample } from "@/lib/vision/types";

const TASKS_VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const SAMPLE_INTERVAL_MS = 100;

type MediaPipeModule = typeof import("@mediapipe/tasks-vision");
type Tasks = {
  face: import("@mediapipe/tasks-vision").FaceLandmarker;
};
type Blendshape = { categoryName?: string; score?: number };

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function blendshapeScore(categories: Blendshape[] | undefined, names: string[]) {
  const values = new Map((categories ?? []).map((entry) => [entry.categoryName, entry.score ?? 0]));
  return average(names.map((name) => values.get(name) ?? 0));
}

function largestFaceIndex(faces: Array<Array<{ x: number; y: number }>> | undefined) {
  if (!faces?.length) return -1;
  return faces.reduce((largest, face, index) => {
    const bounds = (points: Array<{ x: number; y: number }>) => (Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x))) * (Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)));
    return bounds(face) > bounds(faces[largest]) ? index : largest;
  }, 0);
}

function headPose(matrix: unknown) {
  const values = matrix && typeof matrix === "object" && "data" in matrix ? Array.from((matrix as { data: ArrayLike<number> }).data) : [];
  if (values.length < 16) return { yaw: 0, pitch: 0, roll: 0 };
  const rawYaw = Math.atan2(values[8], values[10]);
  const rawPitch = Math.atan2(-values[9], Math.hypot(values[8], values[10]));
  const rawRoll = Math.atan2(values[4], values[0]);
  return {
    yaw: rawYaw === 0 ? 0 : rawYaw,
    pitch: rawPitch === 0 ? 0 : rawPitch,
    roll: rawRoll === 0 ? 0 : rawRoll,
  };
}

function closeTasks(tasks: Partial<Tasks>) {
  tasks.face?.close();
}

async function createTasks(vision: MediaPipeModule, fileset: Awaited<ReturnType<MediaPipeModule["FilesetResolver"]["forVisionTasks"]>>, delegate: "GPU" | "CPU"): Promise<Tasks> {
  const tasks: Partial<Tasks> = {};
  try {
    tasks.face = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: "VIDEO",
      numFaces: 3,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
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
    this.lastVideoTime = -1;
  }

  private sample(video: HTMLVideoElement, timestamp: number): VisionSample {
    if (!this.tasks) throw new Error("Vision tracker has not started");
    const faceResult = this.tasks.face.detectForVideo(video, timestamp);
    const faceIndex = largestFaceIndex(faceResult.faceLandmarks);
    const blendshapes = faceIndex >= 0 ? faceResult.faceBlendshapes?.[faceIndex]?.categories as Blendshape[] | undefined : undefined;
    const facePose = headPose(faceIndex >= 0 ? faceResult.facialTransformationMatrixes?.[faceIndex] : undefined);
    const eyeDirection = blendshapeScore(blendshapes, ["eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft", "eyeLookDownLeft", "eyeLookInRight", "eyeLookOutRight", "eyeLookUpRight", "eyeLookDownRight"]);
    const browMovement = blendshapeScore(blendshapes, ["browInnerUp", "browDownLeft", "browDownRight", "browOuterUpLeft", "browOuterUpRight"]);
    const smileAmount = blendshapeScore(blendshapes, ["mouthSmileLeft", "mouthSmileRight"]);
    const mouthActivity = blendshapeScore(blendshapes, ["jawOpen", "mouthFunnel", "mouthPucker", "mouthPressLeft", "mouthPressRight"]);
    const blinkAmount = blendshapeScore(blendshapes, ["eyeBlinkLeft", "eyeBlinkRight"]);

    return {
      timestamp,
      facePresent: faceIndex >= 0,
      faceConfidence: faceIndex >= 0 ? 1 : 0,
      eyeDirection,
      headYaw: facePose.yaw,
      headPitch: facePose.pitch,
      headRoll: facePose.roll,
      browMovement,
      smileAmount,
      mouthActivity,
      blinkAmount,
    };
  }
}

export function createDeliveryTracker(): DeliveryTracker {
  return new MediaPipeDeliveryTracker();
}
