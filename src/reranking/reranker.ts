import type { SearchResult } from "../types/retireval.js";
export interface Reranker {

    rerank(
        query: string,
        results: SearchResult[]
    ): Promise<SearchResult[]>;

}