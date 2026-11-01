/**
 * Common English filler words. The count is explicitly approximate because
 * browser speech recognition frequently drops "um" and "uh" entirely.
 */
export const FILLER_PATTERN = /\b(?:um+|uh+|like|you\s+know|basically|actually|so|right)\b/gi;

export type FillerCount = {
  total: number;
  byFiller: Record<string, number>;
};

function normalize(match: string): string {
  const value = match.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^um+$/.test(value)) return "um";
  if (/^uh+$/.test(value)) return "uh";
  return value;
}

export function countFillers(text: string): FillerCount {
  const byFiller: Record<string, number> = {};
  let total = 0;
  for (const match of text.matchAll(FILLER_PATTERN)) {
    const key = normalize(match[0]);
    byFiller[key] = (byFiller[key] ?? 0) + 1;
    total += 1;
  }
  return { total, byFiller };
}

export function countWords(text: string): number {
  return text.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
