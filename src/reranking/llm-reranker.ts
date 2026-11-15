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

    try {
        const prompt = this.buildPrompt(query, results);
        const response = await this.llm.generate(prompt);
        const parsed = this.parseResponse(response);

        const filtered: SearchResult[] = [];
        for (const item of parsed.results) {
            if (item.relevant) {
                const original = results[item.index];
                if (original) {
                    filtered.push({
                        ...original,
                        rerankScore: 1,
                    });
                }
            }
        }

        if (filtered.length > 0) {
            return filtered;
        }
    } catch (err: any) {
        console.warn("LLM reranker failed; falling back to vector candidates:", err.message);
    }

    return results.slice(0, 5);
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