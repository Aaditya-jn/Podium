export type JsonSchema = Record<string, unknown>;

export interface LlmAdapter {
  generateStructuredJson(input: {
    prompt: string;
    schema: JsonSchema;
    temperature?: number;
  }): Promise<unknown>;
  transcribeAudio(input: { audioBase64: string; mimeType: string }): Promise<string>;
}
