export const SPEECH_RESTART_WINDOW_MS = 10_000;
export const SPEECH_MAX_RESTARTS = 3;

export type RecognitionFailure = { kind: "benign"; message?: string } | { kind: "fatal"; message: string };
export type SpeechEngineLike = {
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
};

const messages: Record<string, string> = {
  network: "The browser’s speech service could not connect. Try Chrome or Edge, or use audio transcription instead.",
  "service-not-allowed": "This browser does not allow its speech service here. Try Chrome or Edge, or use audio transcription instead.",
  "not-allowed": "Microphone permission was denied. Allow it in your browser settings, then try Chrome or Edge or use audio transcription instead.",
  "audio-capture": "The browser could not access a microphone. Check your microphone and try Chrome or Edge or use audio transcription instead.",
};

export function classifyRecognitionError(code: string): RecognitionFailure {
  if (code === "no-speech") return { kind: "benign", message: "No speech was detected yet. Keep speaking or pause when you’re done." };
  return {
    kind: "fatal",
    message: messages[code] ?? `Speech recognition stopped (${code || "unknown error"}). Try Chrome or Edge, or use audio transcription instead.`,
  };
}

export function planRecognitionRestart(restarts: number[], now: number, recording: boolean) {
  const recent = restarts.filter((time) => now - time < SPEECH_RESTART_WINDOW_MS);
  if (!recording) return { restart: false, restarts: recent, capped: false };
  if (recent.length >= SPEECH_MAX_RESTARTS) return { restart: false, restarts: recent, capped: true };
  return { restart: true, restarts: [...recent, now], capped: false };
}

export function detectSpeechEnvironment(input: { hasRecognition: boolean; hasMediaRecorder: boolean; isBrave: boolean }) {
  const likelyUnsupported = input.isBrave || !input.hasRecognition;
  return {
    likelyUnsupported,
    fallbackAvailable: input.hasMediaRecorder,
    message: input.isBrave
      ? "Brave may not provide a working speech recognition service. Chrome or Edge is recommended; you can also use private audio transcription."
      : !input.hasRecognition
        ? "Speech recognition is unavailable here. Chrome or Edge is recommended; you can also use private audio transcription."
        : "",
  };
}

export function attachRecognitionRecovery(input: {
  engine: SpeechEngineLike;
  isRecording(): boolean;
  restarts: number[];
  now(): number;
  schedule(callback: () => void): unknown;
  cancelSchedule(handle: unknown): void;
  onBenign(message?: string): void;
  onFatal(message: string): void;
  onRestartCap(): void;
}) {
  let blocked = false;
  let timer: unknown;
  input.engine.onerror = ({ error }) => {
    const failure = classifyRecognitionError(error);
    if (failure.kind === "benign") {
      input.onBenign(failure.message);
      return;
    }
    blocked = true;
    input.onFatal(failure.message);
  };
  input.engine.onend = () => {
    if (blocked || !input.isRecording()) return;
    const plan = planRecognitionRestart(input.restarts, input.now(), true);
    input.restarts.splice(0, input.restarts.length, ...plan.restarts);
    if (plan.capped) {
      blocked = true;
      input.onRestartCap();
      return;
    }
    timer = input.schedule(() => {
      if (input.isRecording() && !blocked) {
        try { input.engine.start(); } catch { /* the browser will report a terminal error if it cannot restart */ }
      }
    });
  };
  return {
    cancel() {
      blocked = true;
      if (timer !== undefined) input.cancelSchedule(timer);
      timer = undefined;
    },
  };
}
