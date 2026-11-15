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

  async answer(
    query: string,
    knowledgeBaseId?: string,
    projectId?: string,
    customSystemPrompt?: string
  ): Promise<RagResponse> {
    if (!query.trim()) {
      throw new Error("Query cannot be empty");
    }

    // 1. Embed the user's query
    const queryEmbedding = await this.provider.embedQuery(query);

    // 2. Retrieve candidate chunks with strict tenant isolation (projectId)
    const candidates = await this.repository.search(
      queryEmbedding,
      this.topK,
      knowledgeBaseId,
      query,
      projectId
    );

    if (candidates.length === 0) {
      return {
        answer: "I couldn't find any relevant information in the knowledge base for your query.",
        sources: [],
        retrievedCount: 0,
        relevantCount: 0,
      };
    }

    // 3. Filter / rerank candidate chunks
    const relevantChunks = await this.reranker.rerank(query, candidates);

    // 4. Generate domain-tailored answer using retained chunks
    const chunksForAnswer =
      relevantChunks.length > 0 ? relevantChunks : candidates.slice(0, 5);
    const answer = await this.answerGenerator.generate(
      query,
      chunksForAnswer,
      customSystemPrompt
    );

    // 5. Return answer with citations
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
