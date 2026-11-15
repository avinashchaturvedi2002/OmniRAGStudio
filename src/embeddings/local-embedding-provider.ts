import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./embedding-provider.js";

interface EmbeddingResponse {
  embeddings: number[][];
}

/**
 * Deterministic fallback embedding generator for testing and offline development
 * when the external embedding service is temporarily unavailable.
 */
function generateDeterministicEmbedding(text: string, dimension: number = 768): number[] {
  const vector: number[] = new Array(dimension).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const hash = createHash("sha256").update(word).digest();
    for (let j = 0; j < 32 && j < dimension; j++) {
      const idx = (j * 23 + (hash[j] || 0)) % dimension;
      const currentVal = vector[idx] ?? 0;
      vector[idx] = currentVal + (((hash[j] ?? 0) - 128) / 128.0);
    }
  }

  // Normalize to unit length
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += vector[i]! * vector[i]!;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    vector[0] = 1.0;
    return vector;
  }
  return vector.map((v) => v / norm);
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string =
      process.env.EMBEDDING_SERVICE_URL ||
      process.env.EMBEDDING_MODEL_BASE_URL ||
      "http://localhost:8000"
  ) {}

  async embed(text: string, model: string = "nano-em1"): Promise<number[]> {
    const embeddings = await this.embedBatch([text], model);
    if (embeddings[0] === undefined) {
      throw new Error("Failed to produce embedding");
    }
    return embeddings[0];
  }

  async embedBatch(
    texts: string[],
    model: string = "nano-em1"
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texts,
          is_query: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const data = (await response.json()) as EmbeddingResponse;
        if (
          Array.isArray(data.embeddings) &&
          data.embeddings.length === texts.length
        ) {
          return data.embeddings;
        }
      }
    } catch (error: any) {
      // Embedding service offline -> check for OpenAI or use resilient fallback
    }

    // Fallback: OpenAI if configured
    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      try {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: openAiKey });
        const res = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: texts,
        });
        return res.data.map((d) => d.embedding);
      } catch (err: any) {
        console.warn("OpenAI embedding fallback error:", err.message);
      }
    }

    // Local deterministic embedding generator fallback
    return texts.map((t) => generateDeterministicEmbedding(t));
  }

  async embedQuery(query: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texts: [query],
          is_query: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        const data = (await response.json()) as EmbeddingResponse;
        const embedding = data.embeddings?.[0];
        if (Array.isArray(embedding)) {
          return embedding;
        }
      }
    } catch (error: any) {
      // Embedding service offline -> fallback
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      try {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: openAiKey });
        const res = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: query,
        });
        return res.data[0]!.embedding;
      } catch (err: any) {
        console.warn("OpenAI query embedding fallback error:", err.message);
      }
    }

    return generateDeterministicEmbedding(query);
  }
}
