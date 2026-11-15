import "dotenv/config";

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDatabase } from "./db/mongodb.js";
import { ChunkRepository } from "./db/chunk-repository.js";
import { UserRepository } from "./db/user-repository.js";
import { ProjectRepository } from "./db/project-repository.js";
import type { EmbeddedChunk } from "./types/chunk.js";
import type { DocumentRecord } from "./types/document.js";
import type { User } from "./types/auth.js";
import type { Project } from "./types/project.js";

import { LocalEmbeddingProvider } from "./embeddings/local-embedding-provider.js";
import { LlmReranker } from "./reranking/llm-reranker.js";
import { OllamaClient } from "./llm/ollama-client.js";
import { AnswerGenerator } from "./llm/answer-generator.js";
import { RagService } from "./retrieval/rag-service.js";
import { IngestionService } from "./ingestion/ingestion-service.js";
import { seedInitialData } from "./db/seed.js";

import { createAuthRouter } from "./routes/auth.routes.js";
import { createProjectRouter } from "./routes/project.routes.js";
import { createProjectIngestionRouter } from "./routes/project-ingestion.routes.js";
import { createWidgetChatRouter } from "./routes/widget-chat.routes.js";
import { createIngestionRouter } from "./routes/ingestions.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();

// 1. Cross-Origin Resource Sharing (CORS)
// Critical for embeddable chatbot widgets running across arbitrary client domains
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Project-ID"
  );
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// 2. Serve static frontend web application & embeddable widget
const publicPath = path.join(rootDir, "public");
app.use(express.static(publicPath));

// Health check: verifies that the HTTP server is running
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "rag-engine-saas",
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  let repository: ChunkRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  try {
    const db = await getDatabase();
    const chunkCol = db.collection<EmbeddedChunk>("chunks");
    const docCol = db.collection<DocumentRecord>("documents");
    const userCol = db.collection<User>("users");
    const projectCol = db.collection<Project>("projects");

    repository = new ChunkRepository(chunkCol, docCol);
    userRepo = new UserRepository(userCol);
    projectRepo = new ProjectRepository(projectCol);
    console.log("Database initialized successfully with multi-tenant collections.");
  } catch (error: any) {
    console.error("Warning: MongoDB connection failed on boot:", error.message);
    console.warn("Starting in fallback mock mode for local testing...");

    // In-memory mock collections if Mongo Atlas is unreachable in restricted sandbox
    const mockChunks: EmbeddedChunk[] = [];
    const mockDocs: DocumentRecord[] = [];
    const mockUsers: User[] = [];
    const mockProjects: Project[] = [];

    const mockChunkCol = {
      insertMany: async (items: EmbeddedChunk[]) => { mockChunks.push(...items); return { insertedCount: items.length }; },
      find: (filter: any) => ({
        sort: () => ({ skip: () => ({ limit: () => ({ toArray: async () => mockChunks }) }), toArray: async () => mockChunks }),
        limit: () => ({ toArray: async () => mockChunks }),
        toArray: async () => mockChunks,
      }),
      deleteMany: async (filter: any) => {
        const initial = mockChunks.length;
        const left = mockChunks.filter(c => {
          if (filter.projectId && c.projectId !== filter.projectId) return true;
          if (filter.documentId && c.documentId !== filter.documentId) return true;
          return false;
        });
        mockChunks.length = 0;
        mockChunks.push(...left);
        return { deletedCount: initial - left.length };
      },
      countDocuments: async (filter?: any) => {
        if (!filter || Object.keys(filter).length === 0) return mockChunks.length;
        return mockChunks.filter(c => !filter.projectId || c.projectId === filter.projectId).length;
      },
      distinct: async () => ["default"],
      aggregate: () => ({ toArray: async () => [] }),
    } as any;

    const mockDocCol = {
      updateOne: async (_f: any, doc: any) => { mockDocs.push(doc.$set); return {}; },
      find: (filter: any) => ({
        sort: () => ({
          toArray: async () => mockDocs.filter(d => !filter || !filter.projectId || d.projectId === filter.projectId),
        }),
        toArray: async () => mockDocs.filter(d => !filter || !filter.projectId || d.projectId === filter.projectId),
      }),
      findOne: async (f: any) => mockDocs.find(d => d.id === f.id && (!f.projectId || d.projectId === f.projectId)) || null,
      deleteOne: async (f: any) => {
        const idx = mockDocs.findIndex(d => d.id === f.id && (!f.projectId || d.projectId === f.projectId));
        if (idx >= 0) { mockDocs.splice(idx, 1); return { deletedCount: 1 }; }
        return { deletedCount: 0 };
      },
      countDocuments: async (filter?: any) => {
        if (!filter || Object.keys(filter).length === 0) return mockDocs.length;
        return mockDocs.filter(d => !filter.projectId || d.projectId === filter.projectId).length;
      },
    } as any;

    const mockUserCol = {
      insertOne: async (user: User) => { mockUsers.push(user); return { insertedId: user.id }; },
      findOne: async (filter: any) => {
        if (filter.id) return mockUsers.find(u => u.id === filter.id) || null;
        if (filter.email) return mockUsers.find(u => u.email === filter.email) || null;
        return null;
      },
      countDocuments: async () => mockUsers.length,
    } as any;

    const mockProjectCol = {
      insertOne: async (proj: Project) => { mockProjects.push(proj); return { insertedId: proj.id }; },
      findOne: async (filter: any) => {
        if (filter.id) return mockProjects.find(p => p.id === filter.id) || null;
        if (filter["credentials.publicToken"]) {
          return mockProjects.find(p => p.credentials?.publicToken === filter["credentials.publicToken"]) || null;
        }
        return null;
      },
      find: (filter: any) => ({
        sort: () => ({
          toArray: async () => mockProjects.filter(p => !filter.userId || p.userId === filter.userId),
        }),
        toArray: async () => mockProjects.filter(p => !filter.userId || p.userId === filter.userId),
      }),
      updateOne: async (filter: any, update: any) => {
        const idx = mockProjects.findIndex(p => p.id === filter.id);
        if (idx >= 0 && update.$set) {
          mockProjects[idx] = { ...mockProjects[idx], ...update.$set };
        }
        return { modifiedCount: 1 };
      },
      deleteOne: async (filter: any) => {
        const idx = mockProjects.findIndex(p => p.id === filter.id);
        if (idx >= 0) { mockProjects.splice(idx, 1); return { deletedCount: 1 }; }
        return { deletedCount: 0 };
      },
      countDocuments: async () => mockProjects.length,
    } as any;

    repository = new ChunkRepository(mockChunkCol, mockDocCol);
    userRepo = new UserRepository(mockUserCol);
    projectRepo = new ProjectRepository(mockProjectCol);
  }

  // Seed default demo user & startup demo projects (College, Restaurant, Corporate)
  try {
    await seedInitialData(userRepo, projectRepo);
  } catch (seedErr) {
    console.warn("Notice: Initial seed skipped or already present:", seedErr);
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

  // 1. User Authentication (JWT + Scrypt)
  app.use("/api/auth", createAuthRouter(userRepo, projectRepo));

  // 2. Multi-Tenant Project Management (CRUD, presets, API keys)
  app.use("/api/projects", createProjectRouter(projectRepo, repository, userRepo));

  // 3. Project-scoped Document Ingestion & Chunk Explorer (Dynamic domain transcription)
  app.use("/api/projects", createProjectIngestionRouter(ingestionService, repository, projectRepo, userRepo));

  // 4. Public Embeddable Widget & v1 Chat API (Origin checking + token validation)
  app.use("/api/v1", createWidgetChatRouter(ragService, projectRepo));

  // 5. Backwards-compatibility routes for single-tenant college demo
  const ingestionRouter = createIngestionRouter(ingestionService, repository);
  app.use("/api/knowledge-bases", ingestionRouter);
  app.use("/api", ingestionRouter);

  // College demo chat endpoint (defaults to college-demo project)
  app.post("/api/chat", async (req, res) => {
    const { query, knowledgeBaseId, projectId } = req.body ?? {};

    if (typeof query !== "string" || !query.trim()) {
      res.status(400).json({
        error: "A non-empty query string is required.",
      });
      return;
    }

    try {
      const targetProject = projectId || "college-demo";
      const project = await projectRepo.findById(targetProject);
      const personaPrompt = project?.aiPersona?.systemPrompt;

      const result = await ragService.answer(
        query.trim(),
        knowledgeBaseId,
        targetProject,
        personaPrompt
      );
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
    console.log(`🚀 Multi-Tenant RAG SaaS Studio Platform Running!`);
    console.log(`📡 URL:             http://localhost:${port}`);
    console.log(`🏢 SaaS Studio UI:  http://localhost:${port}/ (Projects & Ingestion)`);
    console.log(`🔑 Auth API:        http://localhost:${port}/api/auth`);
    console.log(`📁 Project API:     http://localhost:${port}/api/projects`);
    console.log(`🔌 V1 Widget API:   http://localhost:${port}/api/v1/chat`);
    console.log(`🎓 College Demo:    http://localhost:${port}/widget-demo.html`);
    console.log(`=======================================================`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exitCode = 1;
});
