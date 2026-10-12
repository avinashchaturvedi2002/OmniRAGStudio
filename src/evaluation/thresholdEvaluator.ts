import "dotenv/config"
import { LocalReranker } from "../reranking/local-reranker.js";

import { getDatabase } from "../db/mongodb.js";
import { ChunkRepository } from "../db/chunk-repository.js";

import { evaluationQueries } from "./test-queries.js";

import { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";
import type{ EmbeddedChunk } from "../types/chunk.js";

const RETRIEVAL_K = 20;
const THRESHOLDS = [
    8,
    6,
    4,
    2,
    0,
    -2,
    -4,
    -6,
    -8,
    -10
];

const reranker = new LocalReranker();

interface ThresholdResult {
    threshold: number;
    recall: number;
    precision: number;
    averageChunks: number;
    noneQueries: number;
    noneRejected: number;
}

async function evaluateThreshold(
    threshold: number
): Promise<ThresholdResult> {

    let totalRelevantRetrieved = 0;
    let totalRelevant = 0;

    let totalRetrieved = 0;

    let totalChunksKept = 0;

    let noneQueries = 0;
    let noneRejected = 0;
    const embeddingProvider=new LocalEmbeddingProvider();
        const db=await getDatabase();
    const collection=db.collection<EmbeddedChunk>("chunks")
    const repository=new ChunkRepository(collection)

    for (const evaluationQuery of evaluationQueries) {

        

        const queryEmbedding =
            await embeddingProvider.embedQuery(
                evaluationQuery.query
            );

        const candidates =
            await repository.search(
                queryEmbedding,
                RETRIEVAL_K
            );

        const reranked =
            await reranker.rerank(
                evaluationQuery.query,
                candidates
            );

        /*
         * Keep only chunks whose reranker
         * score is greater than or equal
         * to our threshold.
         */
        const filtered = reranked.filter(
            result =>
                result.rerankScore !== undefined &&
                result.rerankScore >= threshold
        );

        const relevant =
            evaluationQuery.relevantChunkIndices;

        const retrievedIndices =
            filtered.map(
                result => result.metadata.chunkIndex
            );

        /*
         * ------------------------------------------
         * NONE / UNANSWERABLE QUERY
         * ------------------------------------------
         */

        if (relevant.length === 0) {

            noneQueries++;

            if (filtered.length === 0) {
                noneRejected++;
            }

            continue;
        }

        /*
         * ------------------------------------------
         * ANSWERABLE QUERY
         * ------------------------------------------
         */

        const relevantRetrieved =
            retrievedIndices.filter(
                index => relevant.includes(index)
            );

        totalRelevantRetrieved +=
            relevantRetrieved.length;

        totalRelevant +=
            relevant.length;

        totalRetrieved +=
            retrievedIndices.length;

        totalChunksKept +=
            filtered.length;
    }

    const recall =
        totalRelevant === 0
            ? 0
            : totalRelevantRetrieved / totalRelevant;

    const precision =
        totalRetrieved === 0
            ? 0
            : totalRelevantRetrieved / totalRetrieved;

    /*
     * Average number of chunks returned
     * for answerable queries.
     */
    const answerableQueries =
        evaluationQueries.filter(
            query => query.relevantChunkIndices.length > 0
        ).length;

    const averageChunks =
        answerableQueries === 0
            ? 0
            : totalChunksKept / answerableQueries;

    return {
        threshold,
        recall,
        precision,
        averageChunks,
        noneQueries,
        noneRejected
    };
}

async function main() {

    console.log("\n");
    console.log("==============================================================");
    console.log("                 THRESHOLD EVALUATION");
    console.log("==============================================================");

    console.log(
        "\nThreshold | Recall | Precision | Avg Chunks | NONE Rejection"
    );

    console.log(
        "--------------------------------------------------------------"
    );

    for (const threshold of THRESHOLDS) {

        const result =
            await evaluateThreshold(threshold);

        const noneRejectionRate =
            result.noneQueries === 0
                ? 0
                : result.noneRejected / result.noneQueries;

        console.log(
            `${result.threshold
                .toString()
                .padStart(9)} | ` +

            `${(result.recall * 100)
                .toFixed(2)
                .padStart(6)}% | ` +

            `${(result.precision * 100)
                .toFixed(2)
                .padStart(9)}% | ` +

            `${result.averageChunks
                .toFixed(2)
                .padStart(10)} | ` +

            `${(noneRejectionRate * 100)
                .toFixed(2)
                .padStart(14)}%`
        );
    }

    console.log(
        "\nNONE Rejection means: percentage of unanswerable queries"
        + " for which the filter returned []."
    );
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});