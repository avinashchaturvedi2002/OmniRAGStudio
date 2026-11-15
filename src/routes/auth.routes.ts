import { Router } from "express";
import crypto from "node:crypto";
import { hashPassword, verifyPassword, createToken } from "../auth/auth-utils.js";
import type { UserRepository } from "../db/user-repository.js";
import type { ProjectRepository } from "../db/project-repository.js";
import { createAuthMiddleware, type AuthenticatedRequest } from "../auth/auth-middleware.js";

export function createAuthRouter(
  userRepo: UserRepository,
  projectRepo: ProjectRepository
): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(userRepo);

  // Register
  router.post("/register", async (req, res, next) => {
    try {
      const { email, password, name, companyName } = req.body || {};

      if (!email || typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ error: "A valid email address is required." });
        return;
      }

      if (!password || typeof password !== "string" || password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters long." });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const existingUser = await userRepo.findByEmail(normalizedEmail);
      if (existingUser) {
        res.status(409).json({ error: "An account with this email already exists." });
        return;
      }

      const userId = "usr_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const passwordHash = hashPassword(password);
      const now = new Date().toISOString();

      const newUser = await userRepo.createUser({
        id: userId,
        email: normalizedEmail,
        passwordHash,
        name: (name && typeof name === "string" ? name.trim() : "") || normalizedEmail.split("@")[0] || "User",
        companyName: companyName && typeof companyName === "string" ? companyName.trim() : undefined,
        plan: "starter",
        createdAt: now,
        updatedAt: now,
      });

      const token = createToken({ userId, email: normalizedEmail });

      res.status(201).json({
        message: "Account created successfully.",
        user: newUser,
        token,
      });
    } catch (err) {
      next(err);
    }
  });

  // Login
  router.post("/login", async (req, res, next) => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
      }

      const normalizedEmail = String(email).toLowerCase().trim();
      const user = await userRepo.findByEmail(normalizedEmail);

      if (!user) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }

      const passwordValid = verifyPassword(String(password), user.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }

      const token = createToken({ userId: user.id, email: user.email });
      const { passwordHash: _, ...safeUser } = user;

      res.json({
        message: "Login successful.",
        user: safeUser,
        token,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get current user profile
  router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  return router;
}
