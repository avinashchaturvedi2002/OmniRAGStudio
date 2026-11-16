/**
 * GeminiClient
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps Google Gemini API (@google/genai) for two purposes:
 *   1. Vision / document digitization  → convertImageToMarkdown()
 *   2. Text generation / chat          → generate()
 *
 * Both methods are thin; all prompt engineering lives in the caller.
 *
 * Provider selection (in markdown-converter & ollama-client):
 *   GEMINI  →  Ollama  →  OpenAI  →  mock/error
 *
 * Configure via .env:
 *   GEMINI_API_KEY=your_key_here
 *   GEMINI_VISION_MODEL=gemini-2.0-flash          (default)
 *   GEMINI_CHAT_MODEL=gemini-2.0-flash            (default)
 */

import { GoogleGenAI } from "@google/genai";

const DEFAULT_VISION_MODEL = "gemini-2.0-flash";
const DEFAULT_CHAT_MODEL   = "gemini-2.0-flash";

function isLlmDebugEnabled(): boolean {
  return process.env.LLM_DEBUG?.trim().toLowerCase() === "true";
}

function describeGeminiError(error: unknown): string {
  const details =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return apiKey ? details.replaceAll(apiKey, "[REDACTED]") : details;
}

function buildClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// ─── Vision: image/document buffer → structured Markdown ─────────────────────

export async function geminiConvertImageToMarkdown(
  imageBuffer: Buffer,
  mimeType: string,
  systemPrompt: string,
  fileName: string
): Promise<string> {
  const ai = buildClient();
  if (!ai) throw new Error("GEMINI_API_KEY is not set.");

  const model = process.env.GEMINI_VISION_MODEL || DEFAULT_VISION_MODEL;
  const b64 = imageBuffer.toString("base64");

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: `${systemPrompt}\n\nDigitize this document (${fileName}) into structured Markdown:` },
          { inlineData: { data: b64, mimeType } },
        ],
      },
    ],
    config: { temperature: 0.1 },
  });

  let md = response.text ?? "";

  // Strip any accidental code fences the model might wrap output in
  if (md.startsWith("```markdown")) md = md.slice("```markdown".length);
  else if (md.startsWith("```")) md = md.slice(3);
  if (md.endsWith("```")) md = md.slice(0, -3);

  return md.trim();
}

// ─── Text generation: used by AnswerGenerator / OllamaClient fallback ────────

export async function geminiGenerate(prompt: string): Promise<string> {
  const ai = buildClient();
  if (!ai) throw new Error("GEMINI_API_KEY is not set.");

  const model = process.env.GEMINI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  const debug = isLlmDebugEnabled();
  const startedAt = Date.now();

  if (debug) {
    console.info(`[Gemini] Request started (model=${model}).`);
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.2 },
    });

    const text = response.text ?? "";
    if (debug) {
      console.info(
        `[Gemini] Request succeeded (model=${model}, elapsedMs=${Date.now() - startedAt}, ` +
        `textChars=${text.length}, finishReason=${response.candidates?.[0]?.finishReason ?? "unknown"}, ` +
        `inputTokens=${response.usageMetadata?.promptTokenCount ?? "unknown"}, ` +
        `outputTokens=${response.usageMetadata?.candidatesTokenCount ?? "unknown"}).`
      );
    }
    return text;
  } catch (error) {
    if (debug) {
      console.error(
        `[Gemini] Request failed (model=${model}, elapsedMs=${Date.now() - startedAt}): ` +
        describeGeminiError(error)
      );
    }
    throw error;
  }
}

// ─── Availability check ───────────────────────────────────────────────────────

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY?.trim();
}
