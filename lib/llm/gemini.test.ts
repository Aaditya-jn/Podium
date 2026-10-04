import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { geminiAdapter } from "@/lib/llm/gemini";

const originalKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalModel;
});

describe("Gemini structured-output adapter", () => {
  it("sends a response schema and returns parsed JSON for domain validation", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-test-model";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"topics":[]}' }] } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const schema = { type: "object", properties: { topics: { type: "array", items: { type: "string" } } } };
    const output = await geminiAdapter.generateStructuredJson({ prompt: "Make a list.", schema });
    const request = fetchMock.mock.calls[0];
    const init = request?.[1];
    const body = JSON.parse(String(init?.body)) as {
      contents: { parts: { text: string }[] }[];
      generationConfig: { responseFormat: { text: { mimeType: string; schema: unknown } } };
    };

    expect(output).toEqual({ topics: [] });
    expect(init?.headers).toMatchObject({ "x-goog-api-key": "test-key" });
    expect(body.contents[0]?.parts[0]?.text).toBe("Make a list.");
    expect(body.generationConfig.responseFormat.text).toEqual({ mimeType: "application/json", schema });
  });

  it("rejects invalid JSON so the caller can use its normal fallback", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "not JSON" }] } }],
    }), { status: 200 })));

    await expect(geminiAdapter.generateStructuredJson({ prompt: "", schema: {} })).rejects.toThrow();
  });

  it("sends transcription audio inline without creating a provider file", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "A short test transcript." }] } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(geminiAdapter.transcribeAudio({ audioBase64: "YXVkaW8=", mimeType: "audio/webm" })).resolves.toBe("A short test transcript.");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { contents: { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] }[] };
    expect(body.contents[0]?.parts[0]?.text).toContain("Transcribe the spoken words");
    expect(body.contents[0]?.parts[1]?.inlineData).toEqual({ data: "YXVkaW8=", mimeType: "audio/webm" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(":generateContent");
  });
});
