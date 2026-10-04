import "server-only";

import type { LlmAdapter } from "@/lib/llm/types";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

export const geminiAdapter: LlmAdapter = {
  async generateStructuredJson({ prompt, schema, temperature = 0.45 }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    if (!/^gemini-[a-z0-9.-]+$/i.test(model)) throw new Error("GEMINI_MODEL is invalid");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseFormat: { text: { mimeType: "application/json", schema } },
          temperature,
        },
      }),
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);

    const result = await response.json() as GeminiResponse;
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new Error("Gemini returned no structured output");
    return JSON.parse(text) as unknown;
  },
};
