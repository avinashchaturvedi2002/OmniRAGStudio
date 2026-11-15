import "dotenv/config";
import assert from "node:assert";
import { parseMarkdown } from "../normalization/markdown-parser.js";
import { chunkDocument } from "../chunking/document-chunker.js";
import type { Document } from "../types/document.js";
import { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";
import { embedChunks } from "../embeddings/embed-chunks.js";
import { ChunkRepository } from "../db/chunk-repository.js";
import type { EmbeddedChunk } from "../types/chunk.js";
import type { DocumentRecord } from "../types/document.js";
import { LlmReranker } from "../reranking/llm-reranker.js";
import { OllamaClient } from "../llm/ollama-client.js";
import { AnswerGenerator } from "../llm/answer-generator.js";
import { RagService } from "../retrieval/rag-service.js";

async function runTests() {
  console.log("=================================================");
  console.log("🧪 Running End-to-End Test Suite for College Notice RAG Engine");
  console.log("=================================================");

  // 1. Test Notice Content (Simulating output of LLM Vision on a scanned notice)
  const sampleScannedNoticeMarkdown = `# NATIONAL INSTITUTE OF TECHNOLOGY
## Office of the Dean (Academic Affairs)
**Ref No:** NIT/ACAD/2024/EXAM-1102  
**Date:** 14th November 2024  

## Subject: Schedule for End-Semester Examinations (November 2024)

All B.Tech students are notified that Autumn End-Semester examinations begin on 25th November 2024.

### Examination Schedule & Course Codes

| Date | Shift | Course Code | Subject Name |
| :--- | :--- | :--- | :--- |
| 25-11-2024 | Shift A | CS-301 | Database Management Systems |
| 27-11-2024 | Shift A | CS-303 | Operating Systems |
| 29-11-2024 | Shift A | CS-305 | Computer Networks |

### Mandatory Attendance Rules
1. A minimum of 75% attendance is required to sit for the examinations.
2. Students with shortage of attendance will not receive admit cards.

### Fee Payment Deadline
All semester fees must be cleared by 20th November 2024 to download hall tickets.

### Signing Authority
Prof. R. K. Sharma  
Dean of Academic Affairs`;

  // 2. Test Markdown AST Parsing
  console.log("1️⃣ Testing Markdown Section Tree Parser...");
  const root = parseMarkdown(sampleScannedNoticeMarkdown);
  root.title = "Autumn End-Semester Examinations Notice";
  assert(root.children.length > 0, "AST should have top-level sections");
  console.log(`   ✅ Parsed AST with ${root.children.length} top-level sections.`);

  // 3. Test Chunking
  console.log("2️⃣ Testing Semantic Document Chunker...");
  const doc: Document = {
    id: "doc-test-101",
    title: root.title,
    content: sampleScannedNoticeMarkdown,
    source: "scanned_notice_autumn_2024.pdf",
    metadata: {
      sourceType: "pdf",
      category: "Examinations",
      fileName: "scanned_notice_autumn_2024.pdf",
    },
  };

  const chunks = chunkDocument(doc, root, "college-notices");
  assert(chunks.length > 0, "Should generate chunks from document");
  console.log(`   ✅ Generated ${chunks.length} semantic chunks.`);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    console.log(`      Chunk #${i + 1}: [${c.metadata.headingPath.join(" > ")}] (${c.content.length} chars)`);
    assert(c.contentHash, "Chunk must have content hash");
    assert(c.embedText, "Chunk must have embedText");
  }

  // 4. Test Embedding Provider (with resilient fallback)
  console.log("3️⃣ Testing Embedding Provider & Embedding Chunks...");
  const provider = new LocalEmbeddingProvider();
  const embeddedChunks = await embedChunks(chunks, provider, "nano-em1");
  assert.strictEqual(embeddedChunks.length, chunks.length);
  for (const ec of embeddedChunks) {
    assert(Array.isArray(ec.embedding), "Chunk must have embedding array");
    assert(ec.embedding.length > 0, "Embedding must have positive length");
  }
  console.log(`   ✅ Successfully embedded all ${embeddedChunks.length} chunks (dim: ${embeddedChunks[0]!.embedding.length}).`);

  // 5. Test Chunk Repository & Cosine Vector Search
  console.log("4️⃣ Testing Chunk Repository (Mock / Atlas Store)...");
  const storedChunks: EmbeddedChunk[] = [];
  const storedDocs: DocumentRecord[] = [];

  const mockChunkColl = {
    insertMany: async (items: EmbeddedChunk[]) => {
      storedChunks.push(...items);
      return { insertedCount: items.length };
    },
    find: (filter?: any) => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({ toArray: async () => storedChunks }),
        }),
        toArray: async () => {
          if (filter?.documentId) return storedChunks.filter(c => c.documentId === filter.documentId);
          return storedChunks;
        },
      }),
      limit: (n: number) => ({ toArray: async () => storedChunks.slice(0, n) }),
      toArray: async () => {
        if (filter?.documentId) return storedChunks.filter(c => c.documentId === filter.documentId);
        return storedChunks;
      },
    }),
    deleteMany: async (filter: any) => {
      const init = storedChunks.length;
      const keep = storedChunks.filter(c => c.documentId !== filter.documentId);
      storedChunks.length = 0;
      storedChunks.push(...keep);
      return { deletedCount: init - keep.length };
    },
    countDocuments: async () => storedChunks.length,
    distinct: async () => ["college-notices"],
    aggregate: () => ({ toArray: async () => [] }),
  } as any;

  const mockDocColl = {
    updateOne: async (_f: any, update: any) => {
      storedDocs.push(update.$set);
      return {};
    },
    find: () => ({
      sort: () => ({ toArray: async () => storedDocs }),
      toArray: async () => storedDocs,
    }),
    findOne: async (f: any) => storedDocs.find(d => d.id === f.id) || null,
    deleteOne: async (f: any) => {
      const idx = storedDocs.findIndex(d => d.id === f.id);
      if (idx >= 0) {
        storedDocs.splice(idx, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
    countDocuments: async () => storedDocs.length,
  } as any;

  const repo = new ChunkRepository(mockChunkColl, mockDocColl);
  await repo.insertChunks(embeddedChunks);
  await repo.saveDocument({
    id: doc.id,
    knowledgeBaseId: "college-notices",
    title: doc.title,
    fileName: doc.source,
    fileSize: 1234,
    chunkCount: embeddedChunks.length,
    uploadedAt: new Date().toISOString(),
    category: "Examinations",
    sourceType: "pdf",
    previewMarkdown: sampleScannedNoticeMarkdown.slice(0, 200),
    strategyUsed: "vision_llm",
    status: "processed",
  });

  const retrievedChunks = await repo.getChunksByDocumentId(doc.id);
  assert.strictEqual(retrievedChunks.length, embeddedChunks.length);
  console.log(`   ✅ Persisted and verified ${retrievedChunks.length} chunks in repository.`);

  // 6. Test Vector Retrieval with Query Embedding
  console.log("5️⃣ Testing Vector Similarity Search...");
  const query = "When do the end semester exams start and what is the fee deadline?";
  const queryEmbedding = await provider.embedQuery(query);
  const searchResults = await repo.search(queryEmbedding, 3, "college-notices", query);
  assert(searchResults.length > 0, "Search should return top chunks");
  console.log(`   ✅ Search returned ${searchResults.length} matching candidates:`);
  for (const sr of searchResults) {
    console.log(`      Score: ${sr.score.toFixed(4)} | Path: ${sr.metadata.headingPath.join(" > ")}`);
  }

  // 7. Test RAG Service End-to-End
  console.log("6️⃣ Testing Full RagService (Retrieval + Rerank + Answer Generation)...");
  const ollama = new OllamaClient();
  const reranker = new LlmReranker(ollama);
  const generator = new AnswerGenerator(ollama);
  const ragService = new RagService(provider, repo, reranker, generator, 5);

  const ragResult = await ragService.answer(query, "college-notices");
  assert(ragResult.answer, "RAG result must have an answer");
  console.log(`   ✅ RAG Answer received:`);
  console.log(`      "${ragResult.answer.slice(0, 150)}..."`);
  console.log(`   ✅ Sources cited: ${ragResult.sources.length}`);

  console.log("=================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
