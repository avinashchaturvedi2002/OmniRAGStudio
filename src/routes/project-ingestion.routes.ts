import { Router } from "express";
import multer from "multer";
import path from "node:path";
import type { IngestionService } from "../ingestion/ingestion-service.js";
import type { ChunkRepository } from "../db/chunk-repository.js";
import type { ProjectRepository } from "../db/project-repository.js";
import type { UserRepository } from "../db/user-repository.js";
import {
  createAuthMiddleware,
  createProjectAccessMiddleware,
  type AuthenticatedRequest,
} from "../auth/auth-middleware.js";

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

export function createProjectIngestionRouter(
  ingestionService: IngestionService,
  chunkRepo: ChunkRepository,
  projectRepo: ProjectRepository,
  userRepo: UserRepository
): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(userRepo);
  const requireProjectAccess = createProjectAccessMiddleware(projectRepo);

  router.use(requireAuth);

  // 1. Upload & Ingest a Document into this Project (using dynamic project domain prompt)
  router.post(
    "/:projectId/documents",
    requireProjectAccess,
    upload.single("file"),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Please upload a file using the 'file' field." });
          return;
        }

        const project = req.project!;
        const strategy = req.body.strategy as any;
        const category = (req.body.category as string) || project.category;
        const title = req.body.title as string | undefined;

        // Use the project's dynamic domain transcription prompt
        const prompt = (req.body.prompt as string) || project.ingestionPrompt;

        const result = await ingestionService.ingest(file, project.id, {
          projectId: project.id,
          userId: req.user!.id,
          strategy,
          category,
          title,
          prompt,
        });

        res.status(201).json({
          message: "Document ingested successfully into project.",
          ...result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 2. Preview conversion using this project's dynamic prompt without saving to DB
  router.post(
    "/:projectId/preview",
    requireProjectAccess,
    upload.single("file"),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Please upload a file using the 'file' field." });
          return;
        }

        const project = req.project!;
        const strategy = req.body.strategy as any;
        const category = (req.body.category as string) || project.category;
        const title = req.body.title as string | undefined;
        const prompt = (req.body.prompt as string) || project.ingestionPrompt;

        const result = await ingestionService.preview(file, project.id, {
          projectId: project.id,
          userId: req.user!.id,
          strategy,
          category,
          title,
          prompt,
        });

        res.status(200).json({
          message: "Notice parsed and preview generated.",
          ...result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 3. List all documents in this project
  router.get(
    "/:projectId/documents",
    requireProjectAccess,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const docs = await chunkRepo.getDocuments(undefined, req.project!.id);
        res.json({
          projectId: req.project!.id,
          count: docs.length,
          documents: docs,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 4. Get chunks for a specific document inside this project
  router.get(
    "/:projectId/documents/:documentId/chunks",
    requireProjectAccess,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const rawDocId = req.params.documentId;
        const documentId = Array.isArray(rawDocId) ? rawDocId[0] : rawDocId;
        if (!documentId) {
          res.status(400).json({ error: "documentId is required." });
          return;
        }

        const chunks = await chunkRepo.getChunksByDocumentId(documentId, req.project!.id);
        res.json({
          documentId,
          projectId: req.project!.id,
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
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. Delete document & chunks from this project
  router.delete(
    "/:projectId/documents/:documentId",
    requireProjectAccess,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const rawDocId = req.params.documentId;
        const documentId = Array.isArray(rawDocId) ? rawDocId[0] : rawDocId;
        if (!documentId) {
          res.status(400).json({ error: "documentId is required." });
          return;
        }

        const result = await chunkRepo.deleteDocument(documentId, req.project!.id);
        res.json({
          message: "Document deleted successfully.",
          projectId: req.project!.id,
          documentId,
          ...result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
