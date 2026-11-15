import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./auth-utils.js";
import type { UserRepository } from "../db/user-repository.js";
import type { ProjectRepository } from "../db/project-repository.js";
import type { SafeUser } from "../types/auth.js";
import type { Project } from "../types/project.js";

export interface AuthenticatedRequest extends Request {
  user?: SafeUser;
  project?: Project;
}

export function createAuthMiddleware(userRepo: UserRepository) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      let token: string | undefined;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      } else if (typeof req.query.token === "string") {
        token = req.query.token.trim();
      }

      if (!token) {
        res.status(401).json({ error: "Unauthorized: Missing authentication token." });
        return;
      }

      const payload = verifyToken(token);
      if (!payload) {
        res.status(401).json({ error: "Unauthorized: Token is invalid or expired." });
        return;
      }

      const user = await userRepo.findSafeById(payload.userId);
      if (!user) {
        res.status(401).json({ error: "Unauthorized: User no longer exists." });
        return;
      }

      req.user = user;
      next();
    } catch (err: any) {
      res.status(500).json({ error: "Authentication error: " + err.message });
    }
  };
}

export function createProjectAccessMiddleware(projectRepo: ProjectRepository) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawId = req.params.projectId;
      const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!projectId || typeof projectId !== "string") {
        res.status(400).json({ error: "Project ID is required in URL path." });
        return;
      }

      const project = await projectRepo.findById(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found." });
        return;
      }

      // Ensure logged in user owns this project
      if (!req.user || project.userId !== req.user.id) {
        res.status(403).json({ error: "Forbidden: You do not have access to this project." });
        return;
      }

      req.project = project;
      next();
    } catch (err: any) {
      res.status(500).json({ error: "Project verification error: " + err.message });
    }
  };
}

export function createWidgetAuthMiddleware(projectRepo: ProjectRepository) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = req.body || {};
      const token =
        (req.headers["x-project-token"] as string) ||
        body.token ||
        (req.query.token as string);
      const projectId =
        body.projectId ||
        (req.query.projectId as string) ||
        (req.headers["x-project-id"] as string);

      let project: Project | null = null;

      if (token) {
        project = await projectRepo.findByPublicToken(token);
      } else if (projectId) {
        project = await projectRepo.findById(projectId);
      }

      if (!project) {
        res.status(401).json({
          error: "Unauthorized widget: Invalid project credentials or project ID.",
        });
        return;
      }

      // Check allowed domains if specified
      const allowedDomains = project.widgetConfig?.allowedDomains || [];
      if (allowedDomains.length > 0 && !allowedDomains.includes("*")) {
        const origin = req.headers.origin || req.headers.referer || "";
        let host = "";
        try {
          if (origin) host = new URL(origin).hostname;
        } catch {}

        const isAllowed = allowedDomains.some((d) => {
          if (d === host) return true;
          if (d.startsWith("*.") && host.endsWith(d.slice(2))) return true;
          if (d === "localhost" && (host === "localhost" || host === "127.0.0.1")) return true;
          return false;
        });

        if (origin && !isAllowed) {
          res.status(403).json({
            error: `Domain "${host}" is not authorized for this chatbot widget.`,
          });
          return;
        }
      }

      req.project = project;
      next();
    } catch (err: any) {
      res.status(500).json({ error: "Widget verification error: " + err.message });
    }
  };
}
