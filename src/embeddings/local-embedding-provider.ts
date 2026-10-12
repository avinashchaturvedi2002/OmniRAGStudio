
import { error } from "node:console";
import type { EmbeddingProvider } from "./embedding-provider.js";

interface EmbeddingResponse {
  embeddings: number[][];
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string =
      process.env.EMBEDDING_SERVICE_URL || "http://localhost:8000"
  ) {}

  async embed(
    text: string,
    model: string
  ): Promise<number[]> {
    const embeddings = await this.embedBatch([text], model);
    if(embeddings[0]==undefined)
      throw new Error("fuck it")
    return embeddings[0];
  }

  async embedBatch(
    texts: string[],
    _model: string
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts,
        is_query: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Embedding service failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as EmbeddingResponse;

    if (
      !Array.isArray(data.embeddings) ||
      data.embeddings.length !== texts.length
    ) {
      throw new Error(
        `Expected ${texts.length} embeddings, received ${
          data.embeddings?.length ?? 0
        }`
      );
    }

    return data.embeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts: [query],
        is_query: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Query embedding failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as EmbeddingResponse;
    const embedding = data.embeddings?.[0];

    if (!Array.isArray(embedding)) {
      throw new Error("Embedding service returned no query embedding");
    }

    return embedding;
  }
}
