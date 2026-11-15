import { Router } from "express";
import type { RagService } from "../retrieval/rag-service.js";
import type { ProjectRepository } from "../db/project-repository.js";
import {
  createWidgetAuthMiddleware,
  type AuthenticatedRequest,
} from "../auth/auth-middleware.js";

export function createWidgetChatRouter(
  ragService: RagService,
  projectRepo: ProjectRepository
): Router {
  const router = Router();
  const verifyWidget = createWidgetAuthMiddleware(projectRepo);

  // 1. Fetch live widget configuration (branding, colors, suggested questions)
  router.get("/widget/config", verifyWidget, async (req: AuthenticatedRequest, res) => {
    const project = req.project!;
    res.json({
      projectId: project.id,
      name: project.name,
      category: project.category,
      widgetConfig: project.widgetConfig,
    });
  });

  // 2. Chat Query Endpoint (Called by embeddable widget or public client integration)
  router.post("/chat", verifyWidget, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { query } = req.body || {};

      if (!query || typeof query !== "string" || !query.trim()) {
        res.status(400).json({ error: "A non-empty query string is required." });
        return;
      }

      const project = req.project!;

      // Retrieve answer with strict tenant isolation and domain-specific persona
      const result = await ragService.answer(
        query.trim(),
        undefined, // search all knowledge bases within this project
        project.id, // STRICT PROJECT / TENANT ISOLATION
        project.aiPersona?.systemPrompt
      );

      // Asynchronously increment query stats
      projectRepo.updateProject(project.id, {
        stats: {
          documentCount: project.stats?.documentCount || 0,
          chunkCount: project.stats?.chunkCount || 0,
          totalQueries: (project.stats?.totalQueries || 0) + 1,
        },
      }).catch(() => {});

      res.json({
        ...result,
        projectId: project.id,
        botTitle: project.widgetConfig?.title || project.name,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
