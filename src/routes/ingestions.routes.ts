import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import multer from "multer";
import path from "node:path";
import type { IngestionService } from "../ingestion/ingestion-service.js";

const router = Router();

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
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return callback(new Error("Unsupported file type"));
    }

    callback(null, true);
  },
});

export function createIngestionRouter(
  ingestionService: IngestionService
) : ExpressRouter{
    const router=Router();
  router.post(
    "/:knowledgeBaseId/documents",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({
            error: "Please upload a file using the 'file' field",
          });
          return;
        }

        const param = req.params.knowledgeBaseId;

if (typeof param !== "string" || !param.trim()) {
  res.status(400).json({
    error: "A valid knowledgeBaseId is required",
  });
  return;
}

const knowledgeBaseId = param.trim();
        const result = await ingestionService.ingest(
          file,
          knowledgeBaseId
        );

        res.status(201).json({
          message: "Document ingested successfully",
          ...result,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}