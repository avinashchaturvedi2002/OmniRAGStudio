import type { Collection } from "mongodb";
import type { EmbeddedChunk } from "../types/chunk.js";
import type { SearchResult } from "../types/retireval.js";
export class ChunkRepository {
    constructor(
        private readonly collection: Collection<EmbeddedChunk>
    ) { }

    async insertChunks(chunks: EmbeddedChunk[]): Promise<void> {
        await this.collection.insertMany(chunks)
    }

    async search(
        queryEmbedding: number[],
        limit: number = 5
    ): Promise<SearchResult[]> {

        return this.collection.aggregate<SearchResult>([
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "embedding",
                    queryVector: queryEmbedding,
                    numCandidates: 50,
                    limit
                }
            },

            {
                $project: {
                    _id: 0,
                    id: 1,
                    documentId: 1,
                    content: 1,
                    metadata: 1,

                    score: {
                        $meta: "vectorSearchScore"
                    }
                }
            }
        ]).toArray();
    }
}