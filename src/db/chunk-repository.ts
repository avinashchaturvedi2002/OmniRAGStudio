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

  async getChunksByDocumentId(
    documentId: string,
    projectId?: string
  ): Promise<EmbeddedChunk[]> {
    const filter: Filter<EmbeddedChunk> = {
      documentId,
      ...(projectId ? { projectId } : {}),
    };
    return this.collection
      .find(filter)
      .sort({ "metadata.chunkIndex": 1 })
      .toArray();
  }

  async getChunks(
    knowledgeBaseId?: string,
    limit: number = 50,
    skip: number = 0,
    projectId?: string
  ): Promise<EmbeddedChunk[]> {
    const filter: Filter<EmbeddedChunk> = {
      ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
      ...(projectId ? { projectId } : {}),
    };
    return this.collection
      .find(filter)
      .sort({ "metadata.chunkIndex": 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async countChunks(
    knowledgeBaseId?: string,
    projectId?: string
  ): Promise<number> {
    const filter: Filter<EmbeddedChunk> = {
      ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
      ...(projectId ? { projectId } : {}),
    };
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

  async getDocuments(
    knowledgeBaseId?: string,
    projectId?: string
  ): Promise<DocumentRecord[]> {
    if (this.docCollection) {
      const filter: Filter<DocumentRecord> = {
        ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
        ...(projectId ? { projectId } : {}),
      };
      return this.docCollection
        .find(filter)
        .sort({ uploadedAt: -1 })
        .toArray();
    }

    // Fallback if docCollection not initialized
    const matchFilter: Record<string, any> = {};
    if (knowledgeBaseId) matchFilter["knowledgeBaseId"] = knowledgeBaseId;
    if (projectId) matchFilter["projectId"] = projectId;

    const pipeline = [
      ...(Object.keys(matchFilter).length > 0 ? [{ $match: matchFilter }] : []),
      {
        $group: {
          _id: "$documentId",
          knowledgeBaseId: { $first: "$knowledgeBaseId" },
          projectId: { $first: "$projectId" },
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
      projectId: r.projectId || "college-demo",
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

  async getDocumentById(
    documentId: string,
    projectId?: string
  ): Promise<DocumentRecord | null> {
    if (this.docCollection) {
      const filter: Filter<DocumentRecord> = {
        id: documentId,
        ...(projectId ? { projectId } : {}),
      };
      return this.docCollection.findOne(filter);
    }
    const chunks = await this.getChunksByDocumentId(documentId, projectId);
    if (chunks.length === 0) return null;
    const first = chunks[0]!;
    return {
      id: documentId,
      projectId: first.projectId,
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
    documentId: string,
    projectId?: string
  ): Promise<{ deletedChunks: number; deletedDocument: boolean }> {
    const chunkFilter: Filter<EmbeddedChunk> = {
      documentId,
      ...(projectId ? { projectId } : {}),
    };
    const chunkRes = await this.collection.deleteMany(chunkFilter);
    let docDeleted = false;
    if (this.docCollection) {
      const docFilter: Filter<DocumentRecord> = {
        id: documentId,
        ...(projectId ? { projectId } : {}),
      };
      const docRes = await this.docCollection.deleteOne(docFilter);
      docDeleted = docRes.deletedCount > 0;
    }
    return {
      deletedChunks: chunkRes.deletedCount,
      deletedDocument: docDeleted,
    };
  }

  async deleteProjectData(
    projectId: string
  ): Promise<{ deletedChunks: number; deletedDocuments: number }> {
    const chunkRes = await this.collection.deleteMany({ projectId });
    let docsDeleted = 0;
    if (this.docCollection) {
      const docRes = await this.docCollection.deleteMany({ projectId });
      docsDeleted = docRes.deletedCount;
    }
    return {
      deletedChunks: chunkRes.deletedCount,
      deletedDocuments: docsDeleted,
    };
  }

  async getStats(projectId?: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
    knowledgeBases: string[];
  }> {
    const chunkFilter: Filter<EmbeddedChunk> = projectId ? { projectId } : {};
    const totalChunks = await this.collection.countDocuments(chunkFilter);
    let totalDocuments = 0;

    if (this.docCollection) {
      const docFilter: Filter<DocumentRecord> = projectId ? { projectId } : {};
      totalDocuments = await this.docCollection.countDocuments(docFilter);
    } else {
      const distinctDocs = await this.collection.distinct(
        "documentId",
        chunkFilter
      );
      totalDocuments = distinctDocs.length;
    }

    const kbSet = new Set<string>();
    const distinctKbs = await this.collection.distinct(
      "knowledgeBaseId",
      chunkFilter
    );
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
    queryText?: string,
    projectId?: string
  ): Promise<SearchResult[]> {
    // 1. Try MongoDB Atlas Vector Search first with strict tenant isolation
    try {
      const vectorSearchStage: Record<string, any> = {
        index: "vector_index",
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: Math.max(50, limit * 5),
        limit,
      };

      const filterConditions: Record<string, any> = {};
      if (projectId) {
        filterConditions["projectId"] = { $eq: projectId };
      }
      if (knowledgeBaseId) {
        filterConditions["knowledgeBaseId"] = { $eq: knowledgeBaseId };
      }

      if (Object.keys(filterConditions).length > 0) {
        vectorSearchStage.filter = filterConditions;
      }

      const results = await this.collection
        .aggregate<SearchResult>([
          { $vectorSearch: vectorSearchStage },
          {
            $project: {
              _id: 0,
              id: 1,
              documentId: 1,
              projectId: 1,
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
    } catch {
      // Vector search index not present or error -> fallback to local cosine calculation
    }

    // 2. Resilient fallback: fetch chunks filtered by projectId and compute cosine similarity
    const filter: Filter<EmbeddedChunk> = {
      ...(projectId ? { projectId } : {}),
      ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
    };

    const candidates = await this.collection.find(filter).limit(250).toArray();
    if (candidates.length === 0) {
      return [];
    }

    const queryTokens = queryText
      ? queryText.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
      : [];

    const scored = candidates.map((chunk) => {
      let sim = cosineSimilarity(queryEmbedding, chunk.embedding || []);

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
