import type { SearchResult } from "../types/retireval.js";
import type { Reranker } from "./reranker.js";
import { OllamaClient } from "../llm/ollama-client.js";
import type { RelevanceResponse } from "../types/relevance.js";

export class LlmReranker implements Reranker {
    constructor(
        private readonly llm = new OllamaClient()
    ) {}

    
async rerank(
    query: string,
    results: SearchResult[]
): Promise<SearchResult[]> {
    if (results.length === 0) {
        return [];
    }

    const prompt = this.buildPrompt(query, results);
    const response = await this.llm.generate(prompt);
    const parsed = this.parseResponse(response);

    return parsed.results
        .filter((result) => result.relevant)
        .map((result) => {
            const original = results[result.index];

            if (original === undefined) {
                throw new Error(
                    `LLM returned invalid chunk index: ${result.index}`
                );
            }

            return {
                ...original,
                rerankScore: 1,
            };
        });
}


    private buildPrompt(
        query: string,
        results: SearchResult[]
    ): string {

        const chunks = results
            .map(
                (result, index) =>
                    `[${index}]\n${result.content}`
            )
            .join("\n\n");

        return `
You are a relevance classifier for a Retrieval-Augmented Generation system.

Your task is to determine whether each retrieved chunk contains
information that can directly help answer the user's query.

A chunk is RELEVANT if:
- It directly provides information needed to answer the query.
- Its information can be used as evidence for the answer.

A chunk is NOT RELEVANT if:
- It is only generally related to the topic.
- It discusses a different concept.
- It cannot provide evidence for answering the query.

Do not use outside knowledge.
Judge each chunk only by whether the chunk itself supports answering the query.

User query:
${query}

Retrieved chunks:

${chunks}

Return ONLY valid JSON in this exact format:

{
  "results": [
    {
      "index": 0,
      "relevant": true,
      "reason": "short explanation"
    }
  ]
}

Include exactly one result for every chunk.
`.trim();
    }

    private parseResponse(response: string): RelevanceResponse {
        try {
            const cleaned = response
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            return JSON.parse(cleaned);
        } catch {
            throw new Error(
                `Failed to parse LLM relevance response:\n${response}`
            );
        }
    }
}