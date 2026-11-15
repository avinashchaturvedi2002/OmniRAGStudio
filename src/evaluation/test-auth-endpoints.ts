import "dotenv/config";
import assert from "node:assert";
import express from "express";
import { UserRepository } from "../db/user-repository.js";
import { ProjectRepository } from "../db/project-repository.js";
import { createAuthRouter } from "../routes/auth.routes.js";
import { seedInitialData } from "../db/seed.js";
import type { User } from "../types/auth.js";
import type { Project } from "../types/project.js";

async function testAuthEndpoints() {
  console.log("=================================================");
  console.log("🧪 Testing Express Auth Router Endpoints Directly");
  console.log("=================================================");

  const mockUsers: User[] = [];
  const mockProjects: Project[] = [];

  const mockUserCol = {
    insertOne: async (u: User) => { mockUsers.push(u); return {}; },
    findOne: async (f: any) => mockUsers.find(u => u.id === f.id || u.email === f.email) || null,
    countDocuments: async () => mockUsers.length,
  } as any;

  const mockProjectCol = {
    insertOne: async (p: Project) => { mockProjects.push(p); return {}; },
    findOne: async (f: any) => mockProjects.find(p => p.id === f.id) || null,
    find: () => ({
      sort: () => ({ toArray: async () => mockProjects }),
      toArray: async () => mockProjects,
    }),
    updateOne: async () => ({ modifiedCount: 1 }),
    deleteOne: async () => ({ deletedCount: 1 }),
    countDocuments: async () => mockProjects.length,
  } as any;

  const userRepo = new UserRepository(mockUserCol);
  const projectRepo = new ProjectRepository(mockProjectCol);

  // 1. Test Seeding
  console.log("1️⃣ Testing Demo Account Seeding...");
  await seedInitialData(userRepo, projectRepo);
  const admin = await userRepo.findByEmail("admin@campus.edu");
  assert(admin !== null, "Admin account must be seeded");
  assert.strictEqual(admin?.email, "admin@campus.edu");
  console.log("   ✅ Demo admin user verified in repository.");

  // 2. Setup Express app in memory
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(userRepo, projectRepo));

  // Helper to make mock requests against the express app
  async function simulateRequest(method: string, path: string, body?: any, token?: string) {
    return new Promise<{ status: number; body: any }>((resolve) => {
      const req: any = {
        method,
        url: path,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body || {},
      };

      let statusCode = 200;
      let responseBody: any = null;

      const res: any = {
        statusCode: 200,
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          responseBody = data;
          resolve({ status: statusCode, body: responseBody });
        },
        send(data: any) {
          responseBody = data;
          resolve({ status: statusCode, body: responseBody });
        },
        setHeader() {},
      };

      (app as any).handle(req, res, () => {
        resolve({ status: 404, body: { error: "Not found" } });
      });
    });
  }

  // 3. Test Login with seeded credentials
  console.log("2️⃣ Testing POST /api/auth/login with Demo Account...");
  const loginRes = await simulateRequest("POST", "/api/auth/login", {
    email: "admin@campus.edu",
    password: "Password123",
  });

  assert.strictEqual(loginRes.status, 200, "Login must return 200 OK");
  assert(loginRes.body.token, "Login response must contain JWT token");
  assert.strictEqual(loginRes.body.user.email, "admin@campus.edu");
  console.log("   ✅ 1-Click Demo Login returned 200 OK with valid JWT token.");

  // 4. Test Login with invalid credentials
  console.log("3️⃣ Testing POST /api/auth/login with Invalid Password...");
  const failLogin = await simulateRequest("POST", "/api/auth/login", {
    email: "admin@campus.edu",
    password: "WrongPassword999",
  });
  assert.strictEqual(failLogin.status, 401, "Invalid password must return 401 Unauthorized");
  assert.strictEqual(failLogin.body.error, "Invalid email or password.");
  console.log("   ✅ Invalid password properly rejected with 401 JSON error.");

  // 5. Test Registration
  console.log("4️⃣ Testing POST /api/auth/register for New Client...");
  const regRes = await simulateRequest("POST", "/api/auth/register", {
    email: "founder@newstartup.io",
    password: "SecurePassword2025",
    name: "Alex Vance",
    companyName: "Vance Technologies",
  });

  assert.strictEqual(regRes.status, 201, "Registration must return 201 Created");
  assert(regRes.body.token, "Registration must return token");
  assert.strictEqual(regRes.body.user.email, "founder@newstartup.io");
  assert(regRes.body.initialProjectId, "Registration must auto-provision an initial project");
  console.log(`   ✅ Registration succeeded. Auto-provisioned bot ID: ${regRes.body.initialProjectId}`);

  // 6. Test GET /api/auth/me with Bearer token
  console.log("5️⃣ Testing GET /api/auth/me with JWT Bearer Token...");
  const meRes = await simulateRequest("GET", "/api/auth/me", undefined, regRes.body.token);
  assert.strictEqual(meRes.status, 200, "/me must return 200");
  assert.strictEqual(meRes.body.user.email, "founder@newstartup.io");
  console.log("   ✅ /api/auth/me validated JWT session and loaded profile.");

  console.log("=================================================");
  console.log("🎉 ALL AUTH ROUTER TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================");
}

testAuthEndpoints().catch((err) => {
  console.error("❌ Auth test failed:", err);
  process.exit(1);
});
