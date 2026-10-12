
import { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";
import { ChunkRepository } from "../db/chunk-repository.js";
import { LlmReranker } from "../reranking/llm-reranker.js";
import { AnswerGenerator } from "../llm/answer-generator.js";

export interface RagSource {
  source: string;
  headingPath: string[];
  content: string;
}

export interface RagResponse {
  answer: string;
  sources: RagSource[];
  retrievedCount: number;
  relevantCount: number;
}

export class RagService {
  constructor(
    private readonly provider: LocalEmbeddingProvider,
    private readonly repository: ChunkRepository,
    private readonly reranker: LlmReranker,
    private readonly answerGenerator: AnswerGenerator,
    private readonly topK = 20
  ) {}

  async answer(query: string): Promise<RagResponse> {
    if (!query.trim()) {
      throw new Error("Query cannot be empty");
    }

    // 1. Embed the user's query.
    const queryEmbedding =
      await this.provider.embedQuery(query);

    // 2. Retrieve candidate chunks from MongoDB.
    const candidates = await this.repository.search(
      queryEmbedding,
      this.topK
    );

    // 3. Ask the LLM to filter irrelevant chunks.
    const relevantChunks = await this.reranker.rerank(
      query,
      candidates
    );

    // 4. Generate an answer using only retained chunks.
    const answer = await this.answerGenerator.generate(
      query,
      relevantChunks
    );

    // 5. Return the answer and its supporting sources.
    return {
      answer,
      sources: relevantChunks.map((chunk) => ({
        source: chunk.metadata.source,
        headingPath: chunk.metadata.headingPath,
        content: chunk.content,
      })),
      retrievedCount: candidates.length,
      relevantCount: relevantChunks.length,
    };
  }
}
