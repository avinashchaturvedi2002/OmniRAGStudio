import type { EmbeddingProvider } from "./embedding-provider.js";
import type{ EmbeddingResponse } from "../types/embedding.js";


export class LocalEmbeddingProvider
  implements EmbeddingProvider {

  constructor(
    private readonly baseUrl: string = process.env.EMBEDDING_MODEL_BASE_URL||"http://localhost:8000"
  ) {}

  async embedDocuments(
    texts: string[]
  ): Promise<number[][]> {

    const response = await fetch(
      `${this.baseUrl}/embed`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          texts,
          is_query: false,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Embedding service failed: ${response.status}`
      );
    }

    const data =
      await response.json() as EmbeddingResponse;

    return data.embeddings;
  }

  async embedQuery(
    text: string
  ): Promise<number[]> {

    const response = await fetch(
      `${this.baseUrl}/embed`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          texts: [text],
          is_query: true,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Embedding service failed: ${response.status}`
      );
    }

    const data =
      await response.json() as EmbeddingResponse;

    const embedding = data.embeddings[0];

    if (!embedding) {
      throw new Error(
        "Embedding service returned no embedding"
      );
    }

    return embedding;
  }
}