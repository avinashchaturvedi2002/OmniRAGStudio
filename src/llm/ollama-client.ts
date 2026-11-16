/**
 * OllamaClient
 * ─────────────────────────────────────────────────────────────────────────────
 * Text generation with a configurable preferred provider and fallback chain:
 *
 *   1. Preferred provider (LLM_PROVIDER; Ollama by default)
 *   2. The other configured provider (Ollama or Gemini)
 *   3. OpenAI API    (secondary cloud option)
 *   4. Error / mock  (surfaces a clear message to the caller)
 *
 * Configure via .env:
 *   OLLAMA_BASE_URL=http://localhost:11434   (default)
 *   OLLAMA_MODEL=qwen3:8b                   (default)
 *   LLM_PROVIDER=ollama|gemini               (preferred provider; defaults to ollama)
 *   GEMINI_API_KEY=...                      (enables Gemini)
 *   OPENAI_API_KEY=...                      (enables OpenAI fallback)
 */

import { geminiGenerate, isGeminiConfigured } from "./gemini-client.js";

export interface OllamaResponse {
  response: string;
}

export class OllamaClient {
  constructor(
    private readonly baseUrl: string = process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    private readonly model: string   = process.env.OLLAMA_MODEL    || "qwen3:8b"
  ) {}

  async generate(prompt: string): Promise<string> {
    const preferredProvider = (process.env.LLM_PROVIDER || "ollama")
      .trim()
      .toLowerCase();
    if (preferredProvider !== "ollama" && preferredProvider !== "gemini") {
      throw new Error(
        `Invalid LLM_PROVIDER "${preferredProvider}". Use "ollama" or "gemini".`
      );
    }
    if (preferredProvider === "gemini" && !isGeminiConfigured()) {
      throw new Error("LLM_PROVIDER=gemini requires GEMINI_API_KEY to be set.");
    }

    const providerOrder =
      preferredProvider === "gemini"
        ? ["gemini", "ollama"]
        : ["ollama", "gemini"];
    const debug = process.env.LLM_DEBUG?.trim().toLowerCase() === "true";
    if (debug) {
      console.info(
        `[LLM] Provider order: ${providerOrder.join(" -> ")}; ` +
        `Gemini configured=${isGeminiConfigured()}.`
      );
    }

    for (const provider of providerOrder) {
      if (debug) console.info(`[LLM] Trying ${provider}.`);
      if (provider === "ollama") {
        try {
          const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: this.model, prompt, stream: false }),
            signal: AbortSignal.timeout(60_000),
          });

          if (response.ok) {
            const data: OllamaResponse = await response.json();
            if (data.response?.trim()) {
              if (debug) console.info("[LLM] Ollama returned a response.");
              return data.response;
            }
          }
        } catch {
          // Ollama not reachable → try the next provider
        }
        continue;
      }

      if (isGeminiConfigured()) {
        try {
          const text = await geminiGenerate(prompt);
          if (text.trim()) return text;
        } catch {
          console.warn("[Gemini] Generation failed; continuing with fallback providers.");
        }
      }
    }

    // ── OpenAI fallback ───────────────────────────────────────────────────────
    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      try {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: openAiKey });
        const res = await openai.chat.completions.create({
          model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        });
        const content = res.choices[0]?.message?.content;
        if (content) return content;
      } catch (err: any) {
        console.warn("OpenAI generation fallback error:", err.message);
      }
    }

    // ── 4. Best-effort context extraction (last resort) ───────────────────────
    const contextMatch = prompt.match(/CONTEXT:\s*([\s\S]*?)\s*USER QUESTION:/i);
    if (contextMatch?.[1]?.trim()) {
      return (
        "Based on the relevant knowledge base:\n\n" +
        contextMatch[1]
          .split("\n\n")
          .filter((p) => p.includes("Content:") || p.includes("[SOURCE"))
          .slice(0, 3)
          .join("\n\n")
      );
    }

    throw new Error(
      `LLM generation failed: no provider available. ` +
      `Configure GEMINI_API_KEY (recommended), OPENAI_API_KEY, or start Ollama at ${this.baseUrl}.`
    );
  }
}
