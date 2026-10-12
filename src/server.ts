import "dotenv/config";

import express from "express";

import { getDatabase } from "./db/mongodb.js";
import { ChunkRepository } from "./db/chunk-repository.js";
import type { EmbeddedChunk } from "./types/chunk.js";

import { LocalEmbeddingProvider } from "./embeddings/local-embedding-provider.js";
import { LlmReranker } from "./reranking/llm-reranker.js";
import { OllamaClient } from "./llm/ollama-client.js";
import { AnswerGenerator } from "./llm/answer-generator.js";
import { RagService } from "./retrieval/rag-service.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

// Health check: verifies that the HTTP server is running.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "rag-engine",
  });
});

async function startServer() {
  // Initialize dependencies once, not on every request.
  const db = await getDatabase();

  const collection =
    db.collection<EmbeddedChunk>("chunks");

  const repository = new ChunkRepository(collection);
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

  app.post("/api/chat", async (req, res) => {
    const { query } = req.body ?? {};

    if (typeof query !== "string" || !query.trim()) {
      res.status(400).json({
        error: "A non-empty query string is required.",
      });
      return;
    }

    try {
      const result = await ragService.answer(query.trim());
      res.json(result);
    } catch (error) {
      console.error("RAG request failed:", error);

      res.status(500).json({
        error: "Failed to process the question.",
      });
    }
  });

  const port = Number(process.env.PORT || 3000);

  app.listen(port, "127.0.0.1", () => {
    console.log(`RAG API listening on http://127.0.0.1:${port}`);
    console.log(`Health: GET http://127.0.0.1:${port}/health`);
    console.log(`Chat:   POST http://127.0.0.1:${port}/api/chat`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start RAG API:", error);
  process.exitCode = 1;
});
