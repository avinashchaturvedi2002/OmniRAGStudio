import type { SearchResult } from "../types/retireval.js";
import type { Reranker } from "./reranker.js";
import type { RerankResponse } from "../types/rerank.js";


export class LocalReranker implements Reranker {

    constructor(
        private readonly baseUrl: string = process.env.EMBEDDING_MODEL_BASE_URL || "http://localhost:8000"
    ) { }
    async rerank(
        query: string,
        results: SearchResult[]
    ): Promise<SearchResult[]> {

        const response = await fetch(
            `${this.baseUrl}/rerank`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    query,
                    documents: results.map(
                        result => result.content
                    ),
                }),
            }
        );


        if (!response.ok) {
            console.log(response)
            throw new Error(
                `Reranker request failed: ${response.status}`
            );

        }


        const data: RerankResponse =
            await response.json();


        return data.results.map(
            reranked => {

                const originalResult =
                    results[reranked.index];

                if (!originalResult) {
                    throw new Error(
                        `Reranker returned invalid index: ${reranked.index}`
                    );
                }

                return {
                    ...originalResult,

                    rerankScore:
                        reranked.score,
                };

            }
        );

    }

}