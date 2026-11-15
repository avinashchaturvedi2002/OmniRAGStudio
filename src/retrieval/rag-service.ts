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

  async answer(query: string, knowledgeBaseId?: string): Promise<RagResponse> {
    if (!query.trim()) {
      throw new Error("Query cannot be empty");
    }

    // 1. Embed the user's query.
    const queryEmbedding = await this.provider.embedQuery(query);

    // 2. Retrieve candidate chunks from MongoDB.
    const candidates = await this.repository.search(
      queryEmbedding,
      this.topK,
      knowledgeBaseId,
      query
    );

    if (candidates.length === 0) {
      return {
        answer: "I couldn't find any relevant college notices or documents in the database for your query.",
        sources: [],
        retrievedCount: 0,
        relevantCount: 0,
      };
    }

    // 3. Ask the LLM to filter irrelevant chunks (with fallback to candidates).
    const relevantChunks = await this.reranker.rerank(query, candidates);

    // 4. Generate an answer using retained chunks.
    const chunksForAnswer = relevantChunks.length > 0 ? relevantChunks : candidates.slice(0, 5);
    const answer = await this.answerGenerator.generate(query, chunksForAnswer);

    // 5. Return the answer and its supporting sources.
    return {
      answer,
      sources: chunksForAnswer.map((chunk) => ({
        source: chunk.metadata.source,
        headingPath: chunk.metadata.headingPath,
        content: chunk.content,
      })),
      retrievedCount: candidates.length,
      relevantCount: chunksForAnswer.length,
    };
  }
}
