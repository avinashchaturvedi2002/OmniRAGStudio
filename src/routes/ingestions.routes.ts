import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import multer from "multer";
import path from "node:path";
import type { IngestionService } from "../ingestion/ingestion-service.js";
import type { ChunkRepository } from "../db/chunk-repository.js";

const allowedExtensions = new Set([
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".xls",
  ".html",
  ".htm",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".xml",
  ".epub",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return callback(
        new Error(
          `Unsupported file type: ${extension}. Allowed: ${Array.from(allowedExtensions).join(", ")}`
        )
      );
    }
    callback(null, true);
  },
});

export function createIngestionRouter(
  ingestionService: IngestionService,
  repository: ChunkRepository
): ExpressRouter {
  const router = Router();

  // 1. Upload and Ingest a College Notice / Document
  router.post(
    "/:knowledgeBaseId/documents",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({
            error: "Please upload a file using the 'file' multipart field.",
          });
          return;
        }

        const param = req.params.knowledgeBaseId;
        if (typeof param !== "string" || !param.trim()) {
          res.status(400).json({
            error: "A valid knowledgeBaseId is required in the URL parameter.",
          });
          return;
        }

        const knowledgeBaseId = param.trim();
        const strategy = req.body.strategy as any;
        const category = req.body.category as string | undefined;
        const title = req.body.title as string | undefined;
        const provider = req.body.provider as any;

        const result = await ingestionService.ingest(file, knowledgeBaseId, {
          strategy,
          category,
          title,
          provider,
        });

        res.status(201).json({
          message: "College notice ingested successfully into database.",
          ...result,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 2. Preview Conversion & Chunking without saving to DB
  router.post(
    "/preview",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({
            error: "Please upload a file using the 'file' field.",
          });
          return;
        }

        const knowledgeBaseId =
          (req.body.knowledgeBaseId as string) || "preview";
        const strategy = req.body.strategy as any;
        const category = req.body.category as string | undefined;
        const title = req.body.title as string | undefined;

        const result = await ingestionService.preview(file, knowledgeBaseId, {
          strategy,
          category,
          title,
        });

        res.status(200).json({
          message: "Notice parsed and preview generated.",
          ...result,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 3. List documents in a specific Knowledge Base
  router.get("/:knowledgeBaseId/documents", async (req, res, next) => {
    try {
      const knowledgeBaseId = req.params.knowledgeBaseId;
      const docs = await repository.getDocuments(knowledgeBaseId);
      res.json({
        knowledgeBaseId,
        count: docs.length,
        documents: docs,
      });
    } catch (error) {
      next(error);
    }
  });

  // 4. List all documents across knowledge bases
  router.get("/documents", async (_req, res, next) => {
    try {
      const docs = await repository.getDocuments();
      res.json({
        count: docs.length,
        documents: docs,
      });
    } catch (error) {
      next(error);
    }
  });

  // 5. Get chunks for a specific document
  router.get("/documents/:documentId/chunks", async (req, res, next) => {
    try {
      const { documentId } = req.params;
      const chunks = await repository.getChunksByDocumentId(documentId);
      res.json({
        documentId,
        count: chunks.length,
        chunks: chunks.map((c) => ({
          id: c.id,
          chunkIndex: c.metadata.chunkIndex,
          headingPath: c.metadata.headingPath,
          source: c.metadata.source,
          content: c.content,
          embedText: c.embedText,
          contentHash: c.contentHash,
          hasEmbedding: Array.isArray(c.embedding) && c.embedding.length > 0,
          embeddingDim: c.embedding?.length || 0,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // 6. Delete a document and all its chunks
  router.delete("/documents/:documentId", async (req, res, next) => {
    try {
      const { documentId } = req.params;
      const result = await repository.deleteDocument(documentId);
      res.json({
        message: "Notice and chunks deleted successfully.",
        documentId,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  // 7. Get overall database and RAG stats
  router.get("/stats", async (_req, res, next) => {
    try {
      const stats = await repository.getStats();
      res.json({
        status: "ok",
        service: "rag-engine",
        ...stats,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
