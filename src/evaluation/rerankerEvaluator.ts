import "dotenv/config"
import { LocalReranker } from "../reranking/local-reranker.js";

import { getDatabase } from "../db/mongodb.js";
import { ChunkRepository } from "../db/chunk-repository.js";

import { evaluationQueries } from "./test-queries.js";

import { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";
import type{ EmbeddedChunk } from "../types/chunk.js";

const RETRIEVAL_K = 20;
const EVALUATION_K = 5;

const reranker = new LocalReranker();

interface RerankerEvaluationResult {
    query: string;
    relevant: number[];
    retrieved: number[];
    top1Relevant: boolean;
    recallAt5: number;
    precisionAt5: number;
    reciprocalRank: number;
}

function recallAtK(
    retrieved: number[],
    relevant: number[],
    k: number
): number {
    if (relevant.length === 0) {
        return 0;
    }

    const topK = retrieved.slice(0, k);

    const hits = topK.filter(index =>
        relevant.includes(index)
    );

    return hits.length / relevant.length;
}

function precisionAtK(
    retrieved: number[],
    relevant: number[],
    k: number
): number {
    const topK = retrieved.slice(0, k);

    if (topK.length === 0) {
        return 0;
    }

    const hits = topK.filter(index =>
        relevant.includes(index)
    );

    return hits.length / topK.length;
}

function reciprocalRank(
    retrieved: number[],
    relevant: number[]
): number {
    if (relevant.length === 0) {
        return 0;
    }

    for (let i = 0; i < retrieved.length; i++) {
        const chunkIndex = retrieved[i];

    if (chunkIndex === undefined) {
        continue;
    }

    if (relevant.includes(chunkIndex)) {
        return 1 / (i + 1);
    }
    }

    return 0;
}

async function evaluateReranker() {

    const db=await getDatabase();
    const collection=db.collection<EmbeddedChunk>("chunks")
    const repository=new ChunkRepository(collection)

    const results: RerankerEvaluationResult[] = [];

    const embeddingProvider=new LocalEmbeddingProvider();

    for (const evaluationQuery of evaluationQueries) {

        console.log("\n----------------------------------------------");
        console.log(`QUERY: ${evaluationQuery.query}`);

        /*
         * STEP 1
         * Embed the query
         */
        const queryEmbedding =
            await embeddingProvider.embedQuery(
                evaluationQuery.query
            );

        /*
         * STEP 2
         * Retrieve candidates using vector search.
         *
         * We intentionally retrieve more than we
         * finally evaluate.
         */
        const candidates =
            await repository.search(
                queryEmbedding,
                RETRIEVAL_K
            );

        /*
         * STEP 3
         * Rerank the candidates using Cross Encoder.
         */
        const reranked =
            await reranker.rerank(
                evaluationQuery.query,
                candidates
            );

        /*
         * STEP 4
         * Convert reranked chunks back to their
         * original chunk indices.
         */
        const retrievedIndices = reranked.map(
            result => result.metadata.chunkIndex
        );

        /*
         * STEP 5
         * Calculate metrics.
         */
        const relevant =
            evaluationQuery.relevantChunkIndices;

        const top1Relevant = retrievedIndices[0]!==undefined&&
            relevant.length > 0 &&
            relevant.includes(retrievedIndices[0]);

        const recall =
            recallAtK(
                retrievedIndices,
                relevant,
                EVALUATION_K
            );

        const precision =
            precisionAtK(
                retrievedIndices,
                relevant,
                EVALUATION_K
            );

        const rr =
            reciprocalRank(
                retrievedIndices,
                relevant
            );

        /*
         * Print ranking.
         */
        console.log("\nRank | Chunk | Rerank Score | Relevant");

        reranked
            .slice(0, EVALUATION_K)
            .forEach((result, index) => {

                const chunkIndex =
                    result.metadata.chunkIndex;

                const isRelevant =
                    relevant.includes(chunkIndex);

                console.log(
                    `${String(index + 1).padStart(4)} | ` +
                    `${String(chunkIndex).padStart(5)} | ` +
                    `${result.rerankScore?.toFixed(4).padStart(12)} | ` +
                    `${isRelevant ? "✓" : "✗"}`
                );
            });

        results.push({
            query: evaluationQuery.query,
            relevant,
            retrieved: retrievedIndices,
            top1Relevant,
            recallAt5: recall,
            precisionAt5: precision,
            reciprocalRank: rr
        });
    }

    /*
     * ==================================================
     * FINAL SUMMARY
     * ==================================================
     */

    const answerable =
        results.filter(
            result => result.relevant.length > 0
        );

    if (answerable.length === 0) {
        console.log("No answerable queries found.");
        return;
    }

    const averageRecall =
        answerable.reduce(
            (sum, result) => sum + result.recallAt5,
            0
        ) / answerable.length;

    const averagePrecision =
        answerable.reduce(
            (sum, result) => sum + result.precisionAt5,
            0
        ) / answerable.length;

    const mrr =
        answerable.reduce(
            (sum, result) => sum + result.reciprocalRank,
            0
        ) / answerable.length;

    const top1Accuracy =
        answerable.filter(
            result => result.top1Relevant
        ).length / answerable.length;

    console.log("\n");
    console.log("==================================================");
    console.log("             RERANKER EVALUATION");
    console.log("==================================================");

    console.log(
        `Answerable queries:       ${answerable.length}`
    );

    console.log(
        `Top-1 relevant:           ${(top1Accuracy * 100).toFixed(2)}%`
    );

    console.log(
        `Average Recall@5:        ${(averageRecall * 100).toFixed(2)}%`
    );

    console.log(
        `Average Precision@5:     ${(averagePrecision * 100).toFixed(2)}%`
    );

    console.log(
        `MRR:                      ${mrr.toFixed(4)}`
    );
}

evaluateReranker().catch(error => {
    console.error(error);
    process.exit(1);
});