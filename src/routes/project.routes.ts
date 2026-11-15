import { Router } from "express";
import crypto from "node:crypto";
import type { ProjectRepository } from "../db/project-repository.js";
import type { ChunkRepository } from "../db/chunk-repository.js";
import type { UserRepository } from "../db/user-repository.js";
import {
  createAuthMiddleware,
  createProjectAccessMiddleware,
  type AuthenticatedRequest,
} from "../auth/auth-middleware.js";
import { DOMAIN_PRESETS } from "../projects/domain-presets.js";
import type { Project, ProjectCategory } from "../types/project.js";

export function createProjectRouter(
  projectRepo: ProjectRepository,
  chunkRepo: ChunkRepository,
  userRepo: UserRepository
): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(userRepo);
  const requireProjectAccess = createProjectAccessMiddleware(projectRepo);

  // Apply authentication to all project management endpoints
  router.use(requireAuth);

  // List all projects for current user
  router.get("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const projects = await projectRepo.findByUserId(req.user!.id);
      
      // Enrich with live chunk/doc counts
      const enriched = await Promise.all(
        projects.map(async (p) => {
          const stats = await chunkRepo.getStats(p.id);
          return {
            ...p,
            stats: {
              documentCount: stats.totalDocuments,
              chunkCount: stats.totalChunks,
              totalQueries: p.stats?.totalQueries || 0,
            },
          };
        })
      );

      res.json({ count: enriched.length, projects: enriched });
    } catch (err) {
      next(err);
    }
  });

  // Create new project
  router.post("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const { name, category, description, customPrompt } = req.body || {};

      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Project name is required." });
        return;
      }

      const validCategories: ProjectCategory[] = ["college", "restaurant", "corporate", "custom"];
      const cat: ProjectCategory = validCategories.includes(category) ? category : "custom";
      const preset = DOMAIN_PRESETS[cat];

      const projectId = "proj_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const now = new Date().toISOString();

      const newProject: Project = {
        id: projectId,
        userId: req.user!.id,
        name: name.trim(),
        category: cat,
        description: (description && typeof description === "string" ? description.trim() : "") || preset.description,
        ingestionPrompt: (customPrompt && typeof customPrompt === "string" ? customPrompt.trim() : "") || preset.ingestionPrompt,
        aiPersona: preset.aiPersona,
        widgetConfig: {
          ...preset.widgetConfig,
          title: name.trim(),
          allowedDomains: ["*"],
        },
        credentials: {
          publicToken: "pk_live_" + crypto.randomBytes(16).toString("hex"),
          secretKey: "sk_live_" + crypto.randomBytes(24).toString("hex"),
        },
        stats: {
          documentCount: 0,
          chunkCount: 0,
          totalQueries: 0,
        },
        createdAt: now,
        updatedAt: now,
      };

      const created = await projectRepo.createProject(newProject);
      res.status(201).json({ message: "Project created successfully.", project: created });
    } catch (err) {
      next(err);
    }
  });

  // Get project details
  router.get("/:projectId", requireProjectAccess, async (req: AuthenticatedRequest, res, next) => {
    try {
      const stats = await chunkRepo.getStats(req.project!.id);
      res.json({
        project: {
          ...req.project!,
          stats: {
            documentCount: stats.totalDocuments,
            chunkCount: stats.totalChunks,
            totalQueries: req.project!.stats?.totalQueries || 0,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Update project settings (AI Persona, Ingestion Prompt, Widget styling, allowed domains)
  router.put("/:projectId", requireProjectAccess, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { name, description, ingestionPrompt, aiPersona, widgetConfig, category } = req.body || {};
      const updateData: Partial<Project> = {};

      if (name && typeof name === "string") updateData.name = name.trim();
      if (description && typeof description === "string") updateData.description = description.trim();
      if (category && typeof category === "string") updateData.category = category as ProjectCategory;
      if (ingestionPrompt && typeof ingestionPrompt === "string") updateData.ingestionPrompt = ingestionPrompt.trim();

      if (aiPersona && typeof aiPersona === "object") {
        updateData.aiPersona = {
          ...req.project!.aiPersona,
          ...aiPersona,
        };
      }

      if (widgetConfig && typeof widgetConfig === "object") {
        updateData.widgetConfig = {
          ...req.project!.widgetConfig,
          ...widgetConfig,
        };
      }

      await projectRepo.updateProject(req.project!.id, updateData);
      const updated = await projectRepo.findById(req.project!.id);

      res.json({ message: "Project updated successfully.", project: updated });
    } catch (err) {
      next(err);
    }
  });

  // Delete project and all associated documents & vector chunks
  router.delete("/:projectId", requireProjectAccess, async (req: AuthenticatedRequest, res, next) => {
    try {
      const projectId = req.project!.id;
      const purgeStats = await chunkRepo.deleteProjectData(projectId);
      await projectRepo.deleteProject(projectId);

      res.json({
        message: "Project and all associated knowledge base vectors deleted successfully.",
        projectId,
        ...purgeStats,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
