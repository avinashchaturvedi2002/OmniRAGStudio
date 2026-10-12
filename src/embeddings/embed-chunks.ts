
import type { Chunk, EmbeddedChunk } from "../types/chunk.js";
import type { EmbeddingProvider } from "./embedding-provider.js";

export async function embedChunks(
  chunks: Chunk[],
  provider: EmbeddingProvider,
  model = "nano-em1"
): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) {
    return [];
  }

  const texts = chunks.map((chunk) => {
    const headingPath = chunk.metadata.headingPath.join(" > ");
    return `${headingPath}\n\n${chunk.content}`;
  });

  const embeddings = await provider.embedBatch(texts, model);

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Expected ${chunks.length} embeddings, received ${embeddings.length}`
    );
  }

  return chunks.map((chunk, index) => {
    const embedding = embeddings[index];

    if (embedding === undefined) {
      throw new Error(`Missing embedding for chunk at index ${index}`);
    }

    return {
      ...chunk,
      embedding,
    };
  });
}
