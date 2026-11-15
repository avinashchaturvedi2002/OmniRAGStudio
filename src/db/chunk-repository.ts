import type { Collection, Filter } from "mongodb";
import type { EmbeddedChunk } from "../types/chunk.js";
import type { SearchResult } from "../types/retireval.js";
import type { DocumentRecord } from "../types/document.js";

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class ChunkRepository {
  constructor(
    private readonly collection: Collection<EmbeddedChunk>,
    private readonly docCollection?: Collection<DocumentRecord>
  ) {}

  async insertChunks(chunks: EmbeddedChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    await this.collection.insertMany(chunks);
  }

  async getChunksByDocumentId(documentId: string): Promise<EmbeddedChunk[]> {
    return this.collection
      .find({ documentId })
      .sort({ "metadata.chunkIndex": 1 })
      .toArray();
  }

  async getChunks(
    knowledgeBaseId?: string,
    limit: number = 50,
    skip: number = 0
  ): Promise<EmbeddedChunk[]> {
    const filter: Filter<EmbeddedChunk> = knowledgeBaseId ? { knowledgeBaseId } : {};
    return this.collection
      .find(filter)
      .sort({ "metadata.chunkIndex": 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async countChunks(knowledgeBaseId?: string): Promise<number> {
    const filter: Filter<EmbeddedChunk> = knowledgeBaseId ? { knowledgeBaseId } : {};
    return this.collection.countDocuments(filter);
  }

  async saveDocument(doc: DocumentRecord): Promise<void> {
    if (this.docCollection) {
      await this.docCollection.updateOne(
        { id: doc.id },
        { $set: doc },
        { upsert: true }
      );
    }
  }

  async getDocuments(knowledgeBaseId?: string): Promise<DocumentRecord[]> {
    if (this.docCollection) {
      const filter = knowledgeBaseId ? { knowledgeBaseId } : {};
      return this.docCollection
        .find(filter)
        .sort({ uploadedAt: -1 })
        .toArray();
    }

    // Fallback: derive documents from chunks if docCollection is not initialized
    const pipeline = [
      ...(knowledgeBaseId ? [{ $match: { knowledgeBaseId } }] : []),
      {
        $group: {
          _id: "$documentId",
          knowledgeBaseId: { $first: "$knowledgeBaseId" },
          title: { $first: "$metadata.documentTitle" },
          source: { $first: "$metadata.source" },
          chunkCount: { $sum: 1 },
          firstChunk: { $first: "$content" },
        },
      },
    ];

    const results = await this.collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      id: r._id,
      knowledgeBaseId: r.knowledgeBaseId || "college-notices",
      title: r.title || r.source || "Notice",
      fileName: r.source || "notice.pdf",
      fileSize: 0,
      chunkCount: r.chunkCount,
      uploadedAt: new Date().toISOString(),
      sourceType: "pdf",
      previewMarkdown: (r.firstChunk || "").slice(0, 300),
      status: "processed",
    }));
  }

  async getDocumentById(documentId: string): Promise<DocumentRecord | null> {
    if (this.docCollection) {
      return this.docCollection.findOne({ id: documentId });
    }
    const chunks = await this.getChunksByDocumentId(documentId);
    if (chunks.length === 0) return null;
    const first = chunks[0]!;
    return {
      id: documentId,
      knowledgeBaseId: first.knowledgeBaseId,
      title: first.metadata.documentTitle || first.metadata.source || "Notice",
      fileName: first.metadata.source || "notice.pdf",
      fileSize: 0,
      chunkCount: chunks.length,
      uploadedAt: new Date().toISOString(),
      sourceType: "pdf",
      previewMarkdown: first.content.slice(0, 300),
      status: "processed",
    };
  }

  async deleteDocument(
    documentId: string
  ): Promise<{ deletedChunks: number; deletedDocument: boolean }> {
    const chunkRes = await this.collection.deleteMany({ documentId });
    let docDeleted = false;
    if (this.docCollection) {
      const docRes = await this.docCollection.deleteOne({ id: documentId });
      docDeleted = docRes.deletedCount > 0;
    }
    return {
      deletedChunks: chunkRes.deletedCount,
      deletedDocument: docDeleted,
    };
  }

  async getStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    knowledgeBases: string[];
  }> {
    const totalChunks = await this.collection.countDocuments();
    let totalDocuments = 0;
    if (this.docCollection) {
      totalDocuments = await this.docCollection.countDocuments();
    } else {
      const distinctDocs = await this.collection.distinct("documentId");
      totalDocuments = distinctDocs.length;
    }

    const kbSet = new Set<string>();
    const distinctKbs = await this.collection.distinct("knowledgeBaseId");
    for (const kb of distinctKbs) {
      if (kb) kbSet.add(kb);
    }
    if (kbSet.size === 0) kbSet.add("college-notices");

    return {
      totalDocuments,
      totalChunks,
      knowledgeBases: Array.from(kbSet),
    };
  }

  async search(
    queryEmbedding: number[],
    limit: number = 5,
    knowledgeBaseId?: string,
    queryText?: string
  ): Promise<SearchResult[]> {
    // 1. Try MongoDB Atlas Vector Search first if index exists
    try {
      const vectorSearchStage: Record<string, any> = {
        index: "vector_index",
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: Math.max(50, limit * 5),
        limit,
      };

      if (knowledgeBaseId) {
        vectorSearchStage.filter = {
          knowledgeBaseId: { $eq: knowledgeBaseId },
        };
      }

      const results = await this.collection
        .aggregate<SearchResult>([
          { $vectorSearch: vectorSearchStage },
          {
            $project: {
              _id: 0,
              id: 1,
              documentId: 1,
              knowledgeBaseId: 1,
              content: 1,
              metadata: 1,
              contentHash: 1,
              embedText: 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
        ])
        .toArray();

      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      // Vector search index not present or error -> gracefully fall back to local cosine calculation
      // console.warn("Atlas VectorSearch unavailable; falling back to cosine similarity calculation.");
    }

    // 2. Resilient fallback: fetch chunks and compute cosine similarity
    const filter: Filter<EmbeddedChunk> = knowledgeBaseId ? { knowledgeBaseId } : {};
    // Load up to 250 candidate chunks for scoring
    const candidates = await this.collection.find(filter).limit(250).toArray();

    if (candidates.length === 0) {
      return [];
    }

    const queryTokens = queryText
      ? queryText.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
      : [];

    const scored = candidates.map((chunk) => {
      let sim = cosineSimilarity(queryEmbedding, chunk.embedding || []);

      // Keyword boost if query text has specific matches (e.g. course codes, dates)
      if (queryTokens.length > 0) {
        const text = (chunk.embedText || chunk.content || "").toLowerCase();
        let matches = 0;
        for (const token of queryTokens) {
          if (text.includes(token)) matches++;
        }
        if (matches > 0) {
          sim += (matches / queryTokens.length) * 0.15;
        }
      }

      return {
        ...chunk,
        score: sim,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
