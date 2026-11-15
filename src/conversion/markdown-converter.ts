import type { Express } from "express";
import path from "node:path";

export interface ConversionOptions {
  strategy?: "auto" | "vision_llm" | "docling" | "text" | undefined;
  provider?: "auto" | "ollama" | "openai" | "gemini" | undefined;
}

export interface ConversionResponse {
  fileName: string;
  mimeType: string | null;
  markdown: string;
  strategy?: string | undefined;
  pageCount?: number | undefined;
  warnings?: string[] | undefined;
}

const COLLEGE_NOTICE_SYSTEM_PROMPT = `
You are an expert document digitization assistant specialized in converting scanned paper college notices, circulars, exam schedules, and academic announcements into clean, highly structured Markdown.

Guidelines:
1. Identify issuing institution name as an H1 heading: # [Institution Name]
2. Transcribe Reference Number, Date, and Academic Year as bold metadata or H2 headings.
3. Transcribe the main notice subject as an H2 heading: ## Subject: [Title of Notice]
4. Organize guidelines, rules, and schedules into distinct sections with H3 headings (### Schedule, ### Instructions, ### Important Dates).
5. Convert tabular data (dates, shifts, subjects, fees) into clean GitHub-Flavored Markdown tables (| Header | Header |).
6. Numbered steps for procedures, bullet points for notes.
7. Include signing authority at the bottom under ### Signing Authority.
8. Output ONLY the raw Markdown text, without wrapping in code fences.
`.trim();

export async function convertFileToMarkdown(
  file: Express.Multer.File,
  options?: ConversionOptions
): Promise<ConversionResponse> {
  const ext = path.extname(file.originalname).toLowerCase();

  // Fast path: plain text and markdown do not need vision conversion
  if (ext === ".md" || ext === ".markdown" || ext === ".txt" || ext === ".csv") {
    return {
      fileName: file.originalname,
      mimeType: file.mimetype || "text/plain",
      markdown: file.buffer.toString("utf-8"),
      strategy: "direct_text",
      pageCount: 1,
    };
  }

  const baseUrl =
    process.env.EMBEDDING_SERVICE_URL ||
    process.env.EMBEDDING_MODEL_BASE_URL ||
    "http://127.0.0.1:8000";

  // Try Python Embedding / Conversion Service
  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype || "application/octet-stream",
    });

    form.append("file", blob, file.originalname);
    if (options?.strategy) {
      form.append("strategy", options.strategy);
    }
    if (options?.provider) {
      form.append("provider", options.provider);
    }

    const response = await fetch(`${baseUrl}/convert`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000), // 2 min timeout for vision LLMs
    });

    if (response.ok) {
      const data = (await response.json()) as ConversionResponse;
      if (data.markdown && data.markdown.trim()) {
        return data;
      }
    } else {
      console.warn(
        `Embedding service /convert returned status ${response.status}. Attempting direct fallback...`
      );
    }
  } catch (error: any) {
    console.warn(
      `Embedding service at ${baseUrl} is unavailable (${error.message}). Attempting direct fallback...`
    );
  }

  // Direct Node.js fallback 1: OpenAI Vision if OPENAI_API_KEY is configured
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey && (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp")) {
    try {
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openAiKey });
      const b64 = file.buffer.toString("base64");
      const mime = file.mimetype || "image/jpeg";

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: COLLEGE_NOTICE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Digitize this college notice (${file.originalname}) into structured Markdown:`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64://${b64}` },
              },
            ],
          },
        ],
        temperature: 0.1,
      });

      let md = res.choices[0]?.message?.content || "";
      if (md.startsWith("```markdown")) md = md.slice("```markdown".length);
      else if (md.startsWith("```")) md = md.slice(3);
      if (md.endsWith("```")) md = md.slice(0, -3);

      return {
        fileName: file.originalname,
        mimeType: file.mimetype,
        markdown: md.trim(),
        strategy: "direct_node:openai_vision",
        pageCount: 1,
      };
    } catch (err: any) {
      console.warn("Direct OpenAI vision fallback failed:", err.message);
    }
  }

  // Direct Node.js fallback 2: Ollama Vision if running locally
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
    try {
      const b64 = file.buffer.toString("base64");
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.VISION_MODEL || "qwen2.5vl:3b",
          stream: false,
          messages: [
            { role: "system", content: COLLEGE_NOTICE_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Convert this college notice (${file.originalname}) into structured Markdown:`,
              images: [b64],
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        let md = data.message?.content || "";
        if (md.startsWith("```markdown")) md = md.slice("```markdown".length);
        else if (md.startsWith("```")) md = md.slice(3);
        if (md.endsWith("```")) md = md.slice(0, -3);

        return {
          fileName: file.originalname,
          mimeType: file.mimetype,
          markdown: md.trim(),
          strategy: "direct_node:ollama_vision",
          pageCount: 1,
        };
      }
    } catch (err: any) {
      console.warn("Direct Ollama vision fallback failed:", err.message);
    }
  }

  throw new Error(
    `Document conversion failed for "${file.originalname}". ` +
    `Please ensure the embedding-service is running (cd embedding-service && uvicorn main:app --port 8000) ` +
    `or configure an LLM vision provider (OPENAI_API_KEY or local Ollama).`
  );
}
