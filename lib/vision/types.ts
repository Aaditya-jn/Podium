export type VisionSample = {
  timestamp: number;
  facePresent: boolean;
  faceConfidence: number;
  eyeDirection: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  browMovement: number;
  smileAmount: number;
  mouthActivity: number;
  blinkAmount: number;
  handsPresent: boolean;
  handConfidence: number;
  handDeltaX: number;
  handDeltaY: number;
  shoulderTiltDegrees: number | null;
  torsoLeanDegrees: number | null;
  shoulderDepth: number | null;
  poseConfidence: number;
};

export type DeliveryTracker = {
  start(video: HTMLVideoElement): Promise<void>;
  stop(): void;
  onSample(listener: (sample: VisionSample) => void): () => void;
};
