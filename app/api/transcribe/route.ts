import { NextResponse } from "next/server";
import { z } from "zod";
import { llm } from "@/lib/llm";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { MAX_SPEECH_AUDIO_BYTES, MAX_SPEECH_AUDIO_DURATION_MS } from "@/lib/speech/limits";

export const maxDuration = 60;

const allowedMimeTypes = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg", "audio/aac", "audio/m4a"]);
const transcriptSchema = z.string().trim().min(1).max(12_000);
const durationSchema = z.coerce.number().int().min(1).max(MAX_SPEECH_AUDIO_DURATION_MS);

export async function POST(request: Request) {
  if (!consumeRateLimit(`transcribe:${getRequestIp(request)}`, 4, 10 * 60_000)) {
    return NextResponse.json({ error: "Please wait before requesting another transcription." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const mimeType = (request.headers.get("x-audio-mime") || request.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
  const duration = durationSchema.safeParse(request.headers.get("x-audio-duration-ms"));
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!allowedMimeTypes.has(mimeType) || !duration.success) {
    return NextResponse.json({ error: "The audio format or recording length is not supported." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (contentLength > MAX_SPEECH_AUDIO_BYTES) return NextResponse.json({ error: "The recording is larger than 8 MB. Please make a shorter recording." }, { status: 413, headers: { "Cache-Control": "no-store" } });

  let bytes: Buffer | null = null;
  let rawBytes: ArrayBuffer | null = null;
  let audioBase64 = "";
  const chunks: Uint8Array[] = [];
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "The recording is empty." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SPEECH_AUDIO_BYTES) {
        value.fill(0);
        await reader.cancel();
        return NextResponse.json({ error: "The recording is larger than 8 MB. Please make a shorter recording." }, { status: 413, headers: { "Cache-Control": "no-store" } });
      }
      chunks.push(value);
    }
    if (totalBytes === 0) return NextResponse.json({ error: "The recording is empty." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    rawBytes = new ArrayBuffer(totalBytes);
    const joined = new Uint8Array(rawBytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    bytes = Buffer.from(joined);
    audioBase64 = bytes.toString("base64");
    const output = await llm.transcribeAudio({ audioBase64, mimeType });
    const parsed = transcriptSchema.safeParse(output);
    if (!parsed.success) return NextResponse.json({ error: "No clear speech transcript came back. You can try recording again." }, { status: 422, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ transcript: parsed.data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Transcription is temporarily unavailable. Your recording has been discarded; try again or use a different browser." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    bytes?.fill(0);
    if (rawBytes) new Uint8Array(rawBytes).fill(0);
    chunks.forEach((chunk) => chunk.fill(0));
    audioBase64 = "";
  }
}
