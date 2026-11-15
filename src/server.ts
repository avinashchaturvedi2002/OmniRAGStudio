import "dotenv/config";

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDatabase } from "./db/mongodb.js";
import { ChunkRepository } from "./db/chunk-repository.js";
import type { EmbeddedChunk } from "./types/chunk.js";
import type { DocumentRecord } from "./types/document.js";

import { LocalEmbeddingProvider } from "./embeddings/local-embedding-provider.js";
import { LlmReranker } from "./reranking/llm-reranker.js";
import { OllamaClient } from "./llm/ollama-client.js";
import { AnswerGenerator } from "./llm/answer-generator.js";
import { RagService } from "./retrieval/rag-service.js";
import { IngestionService } from "./ingestion/ingestion-service.js";
import { createIngestionRouter } from "./routes/ingestions.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();

// 1. Cross-Origin Resource Sharing (CORS)
// Critical for embeddable chatbot widget running on college website domains
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 2. Serve static frontend web application & embeddable widget
const publicPath = path.join(rootDir, "public");
app.use(express.static(publicPath));

// Health check: verifies that the HTTP server is running
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "rag-engine",
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  let db;
  let collection;
  let docCollection;
  let repository: ChunkRepository;

  try {
    db = await getDatabase();
    collection = db.collection<EmbeddedChunk>("chunks");
    docCollection = db.collection<DocumentRecord>("documents");
    repository = new ChunkRepository(collection, docCollection);
    console.log("Database initialized successfully.");
  } catch (error: any) {
    console.error("Warning: MongoDB connection failed on boot:", error.message);
    console.warn("Starting in fallback mock mode for testing...");
    
    // In-memory mock collections if Mongo Atlas is temporarily unreachable in sandbox
    const mockChunks: EmbeddedChunk[] = [];
    const mockDocs: DocumentRecord[] = [];
    const mockCollection = {
      insertMany: async (items: EmbeddedChunk[]) => { mockChunks.push(...items); return { insertedCount: items.length }; },
      find: (filter: any) => ({
        sort: () => ({ skip: () => ({ limit: () => ({ toArray: async () => mockChunks }) }), toArray: async () => mockChunks }),
        limit: () => ({ toArray: async () => mockChunks }),
        toArray: async () => mockChunks,
      }),
      deleteMany: async (filter: any) => {
        const initial = mockChunks.length;
        const left = mockChunks.filter(c => c.documentId !== filter.documentId);
        mockChunks.length = 0;
        mockChunks.push(...left);
        return { deletedCount: initial - left.length };
      },
      countDocuments: async () => mockChunks.length,
      distinct: async () => ["college-notices"],
      aggregate: () => ({ toArray: async () => [] }),
    } as any;

    const mockDocCollection = {
      updateOne: async (_f: any, doc: any) => { mockDocs.push(doc.$set); return {}; },
      find: () => ({ sort: () => ({ toArray: async () => mockDocs }), toArray: async () => mockDocs }),
      findOne: async (f: any) => mockDocs.find(d => d.id === f.id) || null,
      deleteOne: async (f: any) => {
        const idx = mockDocs.findIndex(d => d.id === f.id);
        if (idx >= 0) { mockDocs.splice(idx, 1); return { deletedCount: 1 }; }
        return { deletedCount: 0 };
      },
      countDocuments: async () => mockDocs.length,
    } as any;

    repository = new ChunkRepository(mockCollection, mockDocCollection);
  }

  const provider = new LocalEmbeddingProvider();
  const ollama = new OllamaClient();

  const reranker = new LlmReranker(ollama);
  const answerGenerator = new AnswerGenerator(ollama);

  const ragService = new RagService(
    provider,
    repository,
    reranker,
    answerGenerator,
    20
  );

  const ingestionService = new IngestionService(provider, repository);

  // Ingestion routes for knowledge bases & documents
  const ingestionRouter = createIngestionRouter(ingestionService, repository);
  app.use("/api/knowledge-bases", ingestionRouter);
  app.use("/api", ingestionRouter);

  // Interactive Question-Answering Endpoint for College Notices
  app.post("/api/chat", async (req, res) => {
    const { query, knowledgeBaseId } = req.body ?? {};

    if (typeof query !== "string" || !query.trim()) {
      res.status(400).json({
        error: "A non-empty query string is required.",
      });
      return;
    }

    try {
      const result = await ragService.answer(query.trim(), knowledgeBaseId);
      res.json(result);
    } catch (error: any) {
      console.error("RAG chat request failed:", error);
      res.status(500).json({
        error: "Failed to process the question.",
        details: error.message,
      });
    }
  });

  // Global Error Handler
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("Unhandled error:", err);
      res.status(err.status || 500).json({
        error: err.message || "An unexpected error occurred",
      });
    }
  );

  const port = Number(process.env.PORT || 3000);

  app.listen(port, "0.0.0.0", () => {
    console.log(`=======================================================`);
    console.log(`🎓 College Notice RAG Engine Server Running!`);
    console.log(`📡 URL:       http://localhost:${port}`);
    console.log(`📤 Portal:    http://localhost:${port}/ (Upload notices & inspect chunks)`);
    console.log(`💬 Chat API:  POST http://localhost:${port}/api/chat`);
    console.log(`🔌 Widget:    http://localhost:${port}/widget.js`);
    console.log(`🧪 Demo Site: http://localhost:${port}/widget-demo.html`);
    console.log(`=======================================================`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exitCode = 1;
});
