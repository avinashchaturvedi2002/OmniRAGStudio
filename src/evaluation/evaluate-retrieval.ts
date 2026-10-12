import "dotenv/config";

import { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";
import { ColBertReranker } from "../reranking/colBERT-reranker.js";

import { getDatabase } from "../db/mongodb.js";
import { ChunkRepository } from "../db/chunk-repository.js";

import type { EmbeddedChunk } from "../types/chunk.js";

import { evaluationQueries } from "./test-queries.js";


// ==================================================
// Configuration
// ==================================================

const RETRIEVAL_K = 20;


// ==================================================
// Setup
// ==================================================

const db = await getDatabase();

const collection =
    db.collection<EmbeddedChunk>("chunks");

const repository =
    new ChunkRepository(collection);

const provider =
    new LocalEmbeddingProvider();

const reranker =
    new ColBertReranker();


// ==================================================
// Overall score-gap statistics
// ==================================================

let boundaryGaps: number[] = [];
let largestGaps: number[] = [];

let boundaryIsLargest = 0;
let queriesWithBoundary = 0;


// ==================================================
// Evaluation
// ==================================================

for (const test of evaluationQueries) {

    // ----------------------------------------------
    // 1. Vector retrieval
    // ----------------------------------------------

    const queryEmbedding =
        await provider.embedQuery(test.query);

    const candidates =
        await repository.search(
            queryEmbedding,
            RETRIEVAL_K
        );


    // ----------------------------------------------
    // 2. Cross-Encoder reranking
    // ----------------------------------------------

    const rerankedResults =
        await reranker.rerank(
            test.query,
            candidates
        );


    // ----------------------------------------------
    // 3. Calculate consecutive score gaps
    // ----------------------------------------------

    const gaps: number[] = [];

    for (let i = 0; i < rerankedResults.length - 1; i++) {

        const current = rerankedResults[i];
    const next = rerankedResults[i + 1];

    if (current === undefined || next === undefined) {
        throw new Error("Something went wrong");
    }

    const currentScore = current.rerankScore!;
    const nextScore = next.rerankScore!;

    gaps.push(currentScore - nextScore);
        
    }


    // ----------------------------------------------
    // 4. Find the true relevance boundary
    // ----------------------------------------------

    const relevant =
        test.relevantChunkIndices;

    // NONE queries don't have a relevance boundary.
    if (relevant.length === 0) {

        console.log("\n----------------------------------------------");
        console.log(`QUERY: ${test.query}`);
        console.log("Expected: NONE");

        console.log(
            `Best score: ${rerankedResults[0]?.rerankScore?.toFixed(4)}`
        );

        continue;
    }


    // Find the last relevant chunk in the reranked list.
    let lastRelevantRank = -1;

    for (let i = 0; i < rerankedResults.length; i++) {

        const rerankedResult=rerankedResults[i];
        if(rerankedResult===undefined)
            throw new Error("issue!")
        const chunkIndex =
            rerankedResult.metadata.chunkIndex;

        if (relevant.includes(chunkIndex)) {
            lastRelevantRank = i;
        }
    }


    // If some relevant chunk wasn't retrieved,
    // we cannot analyze its boundary.
    if (
        lastRelevantRank === -1 ||
        lastRelevantRank >= rerankedResults.length - 1
    ) {
        continue;
    }


    queriesWithBoundary++;


    // ----------------------------------------------
    // 5. Boundary gap
    // ----------------------------------------------

    const boundaryGap =
        gaps[lastRelevantRank];
    if(boundaryGap==undefined)
    {

    }
    else
    {
boundaryGaps.push(boundaryGap);
    }
    


    // ----------------------------------------------
    // 6. Largest gap
    // ----------------------------------------------

    let largestGap = -Infinity;
    let largestGapRank = -1;

    for (let i = 0; i < gaps.length; i++) {

        const gap=gaps[i];
        if(gap===undefined)
            throw new Error("Oopsie")

        if (gap > largestGap) {

            largestGap = gap;
            largestGapRank = i;
        }
    }

    largestGaps.push(largestGap);


    if (largestGapRank === lastRelevantRank) {
        boundaryIsLargest++;
    }


    // ==================================================
    // Query analysis
    // ==================================================

    console.log("\n----------------------------------------------");
    console.log(`QUERY: ${test.query}`);

    console.log(
        `Relevant chunks: ${relevant.join(", ")}`
    );

    console.log("\nRank | Chunk | Score   | Gap → next | Relevant");

    for (let i = 0; i < rerankedResults.length; i++) {

        const result =
            rerankedResults[i];

        if(result==undefined)
        {
            throw new Error("result is undefined")
        }

        const chunkIndex =
            result.metadata.chunkIndex;

        const score =
            result.rerankScore!;

        const isRelevant =
            relevant.includes(chunkIndex);

        const gap =
            i < gaps.length
                ? gaps[i]
                : null;
        if(gap==undefined)
        {

        }
        else
        {
            console.log(
            `${String(i + 1).padStart(4)} | ` +
            `${String(chunkIndex).padStart(5)} | ` +
            `${score.toFixed(4).padStart(7)} | ` +
            `${gap !== null
                ? gap.toFixed(4).padStart(10)
                : "-".padStart(10)} | ` +
            `${isRelevant ? "✓" : "✗"}`
        );
        }
        
    }


    // ----------------------------------------------
    // Boundary information
    // ----------------------------------------------

    console.log(
        `\nTrue boundary: after rank ${lastRelevantRank + 1}`
    );

    if(boundaryGap!=undefined)
    console.log(
        `Boundary gap:  ${boundaryGap.toFixed(4)}`
    );

    console.log(
        `Largest gap:   ${largestGap.toFixed(4)} ` +
        `(after rank ${largestGapRank + 1})`
    );

    console.log(
        `Boundary is largest: ${
            largestGapRank === lastRelevantRank
                ? "YES"
                : "NO"
        }`
    );
}


// ==================================================
// Overall analysis
// ==================================================

function average(values: number[]): number {

    if (values.length === 0) {
        return 0;
    }

    return (
        values.reduce(
            (sum, value) => sum + value,
            0
        ) / values.length
    );
}


console.log("\n\n");
console.log("==================================================");
console.log("             SCORE GAP ANALYSIS");
console.log("==================================================");

console.log(
    `Queries with measurable boundary: ${queriesWithBoundary}`
);

console.log(
    `Average boundary gap:             ${average(boundaryGaps).toFixed(4)}`
);

console.log(
    `Average largest gap:              ${average(largestGaps).toFixed(4)}`
);

console.log(
    `Boundary was largest gap:         ${boundaryIsLargest}/${queriesWithBoundary}`
);

if (queriesWithBoundary > 0) {

    console.log(
        `Boundary detected by largest gap: ` +
        `${((boundaryIsLargest / queriesWithBoundary) * 100).toFixed(1)}%`
    );
}