import "server-only";

import { geminiAdapter } from "@/lib/llm/gemini";
import type { LlmAdapter } from "@/lib/llm/types";

// Replace this binding to switch providers without changing domain services.
export const llm: LlmAdapter = geminiAdapter;
