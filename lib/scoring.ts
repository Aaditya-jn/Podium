export type PracticeMode = "speak" | "write";
export type Difficulty = "easy" | "medium" | "hard";

export type TypingTelemetry = {
  keystrokeCount: number;
  typingDurationMs: number;
  flagCount: number;
  tabBlurCount: number;
  timeAwayMs: number;
};

export type ScoreBreakdown = {
  length: number;
  vocabulary: number;
  clarity: number;
  pace: number;
  antiCheatPenalty: number;
};

export type Verification = { flags: number; labels: string[] };

const targets: Record<Difficulty, number> = { easy: 80, medium: 140, hard: 200 };
const fillers = new Set(["um", "uh", "like", "basically", "actually"]);

export function verifyTyping(text: string, telemetry: TypingTelemetry): Verification {
  const flags = Math.max(0, Math.min(20, Math.floor(telemetry.flagCount)));
  const labels: string[] = flags ? ["Unusual input activity was flagged"] : [];
  const chars = text.length;
  const seconds = Math.max(0, telemetry.typingDurationMs / 1000);
  const speed = seconds > 0 ? chars / seconds : chars;
  const rateFlags = seconds >= 2 && speed > 20 ? Math.max(1, Math.ceil((speed - 20) / 10)) : 0;
  const keyMismatch = chars > Math.max(40, telemetry.keystrokeCount * 2.5 + 20) ? 1 : 0;
  const noTypingTime = chars > 80 && seconds < 2 ? 1 : 0;
  const generatedFlags = Math.min(10, rateFlags + keyMismatch + noTypingTime);
  if (rateFlags || noTypingTime) labels.push("Typing speed exceeded the expected range");
  if (keyMismatch) labels.push("Text length did not match recorded typing activity");
  return { flags: flags + generatedFlags, labels: [...new Set(labels)] };
}

export function scorePractice(input: {
  text: string;
  mode: PracticeMode;
  difficulty: Difficulty;
  durationSeconds: number;
  typingTelemetry?: TypingTelemetry;
}): { score: number; breakdown: ScoreBreakdown; flags: number; labels: string[]; wordCount: number; paceWpm: number } {
  const words = input.text.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  const count = words.length;
  const normalized = words.map((word) => word.toLowerCase());
  const uniqueRatio = count ? new Set(normalized).size / count : 0;
  const sentences = input.text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  const averageSentence = sentences.length ? count / sentences.length : count;
  const fillerCount = normalized.filter((word) => fillers.has(word)).length;
  const target = targets[input.difficulty];
  const paceWpm = input.durationSeconds > 0 ? Math.round(count / input.durationSeconds * 60) : 0;
  const length = Math.round(Math.min(40, count / target * 40));
  const vocabulary = Math.round(Math.min(25, uniqueRatio / 0.72 * 25));
  const clarity = Math.round(Math.max(0, 20 - Math.min(12, fillerCount * 1.5) - Math.min(8, Math.abs(averageSentence - 16) * 0.45)));
  const pace = input.mode === "write" ? 15 : Math.round(Math.max(0, 15 - Math.min(15, Math.abs(paceWpm - 140) / 10)));
  const verification = input.mode === "write" && input.typingTelemetry ? verifyTyping(input.text, input.typingTelemetry) : { flags: 0, labels: [] };
  const antiCheatPenalty = verification.flags * 5;
  const breakdown = { length, vocabulary, clarity, pace, antiCheatPenalty };
  return { score: Math.max(0, Math.min(100, length + vocabulary + clarity + pace - antiCheatPenalty)), breakdown, flags: verification.flags, labels: verification.labels, wordCount: count, paceWpm };
}
