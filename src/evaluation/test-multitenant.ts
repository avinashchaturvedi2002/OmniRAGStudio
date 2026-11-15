import "dotenv/config";
import assert from "node:assert";
import crypto from "node:crypto";
import { hashPassword, verifyPassword, createToken, verifyToken } from "../auth/auth-utils.js";
import { UserRepository } from "../db/user-repository.js";
import { ProjectRepository } from "../db/project-repository.js";
import { ChunkRepository } from "../db/chunk-repository.js";
import { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";
import { DOMAIN_PRESETS } from "../projects/domain-presets.js";
import type { User } from "../types/auth.js";
import type { Project } from "../types/project.js";
import type { EmbeddedChunk } from "../types/chunk.js";
import type { DocumentRecord } from "../types/document.js";

async function runMultiTenantTests() {
  console.log("=================================================");
  console.log("🧪 Running Multi-Tenant & Dynamic Ingestion Test Suite");
  console.log("=================================================");

  // 1. Test Password Hashing and JWT Token issuance
  console.log("1️⃣ Testing Auth Security (Scrypt + JWT)...");
  const rawPassword = "StartupPassword!2025";
  const hashed = hashPassword(rawPassword);
  assert(hashed.includes(":"), "Hash format should contain salt:hash");
  assert(verifyPassword(rawPassword, hashed), "Password verification must succeed for valid password");
  assert(!verifyPassword("WrongPassword", hashed), "Password verification must fail for invalid password");

  const token = createToken({ userId: "usr_test123", email: "founder@startup.io" });
  const payload = verifyToken(token);
  assert(payload !== null, "JWT token must verify correctly");
  assert.strictEqual(payload?.userId, "usr_test123");
  assert.strictEqual(payload?.email, "founder@startup.io");
  console.log("   ✅ Password hashing (scrypt) and JWT generation verified.");

  // 2. Setup mock repositories
  console.log("2️⃣ Setting up In-Memory Multi-Tenant Store...");
  const mockUsers: User[] = [];
  const mockProjects: Project[] = [];
  const mockChunks: EmbeddedChunk[] = [];
  const mockDocs: DocumentRecord[] = [];

  const mockUserCol = {
    insertOne: async (u: User) => { mockUsers.push(u); return {}; },
    findOne: async (f: any) => mockUsers.find(u => u.id === f.id || u.email === f.email) || null,
    countDocuments: async () => mockUsers.length,
  } as any;

  const mockProjectCol = {
    insertOne: async (p: Project) => { mockProjects.push(p); return {}; },
    findOne: async (f: any) => {
      if (f.id) return mockProjects.find(p => p.id === f.id) || null;
      if (f["credentials.publicToken"]) return mockProjects.find(p => p.credentials?.publicToken === f["credentials.publicToken"]) || null;
      return null;
    },
    find: (f: any) => ({
      sort: () => ({ toArray: async () => mockProjects.filter(p => !f.userId || p.userId === f.userId) }),
      toArray: async () => mockProjects.filter(p => !f.userId || p.userId === f.userId),
    }),
    updateOne: async (f: any, u: any) => {
      const idx = mockProjects.findIndex(p => p.id === f.id);
      if (idx >= 0 && u.$set) mockProjects[idx] = { ...mockProjects[idx], ...u.$set };
      return { modifiedCount: 1 };
    },
    deleteOne: async (f: any) => {
      const idx = mockProjects.findIndex(p => p.id === f.id);
      if (idx >= 0) { mockProjects.splice(idx, 1); return { deletedCount: 1 }; }
      return { deletedCount: 0 };
    },
    countDocuments: async () => mockProjects.length,
  } as any;

  const mockChunkCol = {
    insertMany: async (items: EmbeddedChunk[]) => { mockChunks.push(...items); return { insertedCount: items.length }; },
    find: (filter: any) => ({
      sort: () => ({
        skip: () => ({ limit: () => ({ toArray: async () => mockChunks }) }),
        toArray: async () => mockChunks.filter(c => !filter || !filter.projectId || c.projectId === filter.projectId),
      }),
      limit: () => ({ toArray: async () => mockChunks.filter(c => !filter || !filter.projectId || c.projectId === filter.projectId) }),
      toArray: async () => mockChunks.filter(c => !filter || !filter.projectId || c.projectId === filter.projectId),
    }),
    deleteMany: async (filter: any) => {
      const init = mockChunks.length;
      const keep = mockChunks.filter(c => {
        if (filter.projectId && c.projectId !== filter.projectId) return true;
        if (filter.documentId && c.documentId !== filter.documentId) return true;
        return false;
      });
      mockChunks.length = 0;
      mockChunks.push(...keep);
      return { deletedCount: init - keep.length };
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
      sort: () => ({ toArray: async () => mockDocs.filter(d => !filter || !filter.projectId || d.projectId === filter.projectId) }),
      toArray: async () => mockDocs.filter(d => !filter || !filter.projectId || d.projectId === filter.projectId),
    }),
    findOne: async (f: any) => mockDocs.find(d => d.id === f.id && (!f.projectId || d.projectId === f.projectId)) || null,
    deleteOne: async (f: any) => {
      const idx = mockDocs.findIndex(d => d.id === f.id);
      if (idx >= 0) { mockDocs.splice(idx, 1); return { deletedCount: 1 }; }
      return { deletedCount: 0 };
    },
    countDocuments: async (filter?: any) => {
      if (!filter || Object.keys(filter).length === 0) return mockDocs.length;
      return mockDocs.filter(d => !filter.projectId || d.projectId === filter.projectId).length;
    },
  } as any;

  const userRepo = new UserRepository(mockUserCol);
  const projectRepo = new ProjectRepository(mockProjectCol);
  const chunkRepo = new ChunkRepository(mockChunkCol, mockDocCol);

  // 3. Create Tenant User & Projects
  console.log("3️⃣ Creating User and 2 Isolated Projects (College & Restaurant)...");
  const user = await userRepo.createUser({
    id: "usr_client_01",
    email: "client@agency.com",
    passwordHash: hashed,
    name: "Client Agency",
    plan: "starter",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const collegeProject: Project = {
    id: "proj_college_sit",
    userId: user.id,
    name: "SIT Notice Bot",
    category: "college",
    description: "Official campus notices",
    ingestionPrompt: DOMAIN_PRESETS.college.ingestionPrompt,
    aiPersona: DOMAIN_PRESETS.college.aiPersona,
    widgetConfig: { ...DOMAIN_PRESETS.college.widgetConfig, allowedDomains: ["*"] },
    credentials: {
      publicToken: "pk_live_college_sit",
      secretKey: "sk_live_secret_1",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const restaurantProject: Project = {
    id: "proj_restaurant_bella",
    userId: user.id,
    name: "Bella Italia Concierge",
    category: "restaurant",
    description: "Italian trattoria menu & table bookings",
    ingestionPrompt: DOMAIN_PRESETS.restaurant.ingestionPrompt,
    aiPersona: DOMAIN_PRESETS.restaurant.aiPersona,
    widgetConfig: { ...DOMAIN_PRESETS.restaurant.widgetConfig, allowedDomains: ["*"] },
    credentials: {
      publicToken: "pk_live_restaurant_bella",
      secretKey: "sk_live_secret_2",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await projectRepo.createProject(collegeProject);
  await projectRepo.createProject(restaurantProject);
  console.log("   ✅ Both projects created under the user account.");

  // 4. Test Ingestion into separate projects
  console.log("4️⃣ Ingesting Chunks with Strict Project Scoping...");
  const provider = new LocalEmbeddingProvider();

  // College Chunk
  const collegeEmbedding = await provider.embedQuery("End semester exam schedule starts 25th November");
  const collegeChunk: EmbeddedChunk = {
    id: "chk_college_01",
    documentId: "doc_college_exam",
    projectId: "proj_college_sit",
    knowledgeBaseId: "academic",
    content: "Notice Ref 1102: Autumn End-Semester Exams begin on 25th November 2024 for B.Tech.",
    embedText: "Notice Ref 1102: Autumn End-Semester Exams begin on 25th November 2024 for B.Tech.",
    embedding: collegeEmbedding,
    metadata: {
      source: "exam_notice.pdf",
      headingPath: ["Examinations", "Schedule"],
      category: "Academic",
      chunkIndex: 0,
    },
    contentHash: "hash_col_01",
  };

  // Restaurant Chunk
  const restEmbedding = await provider.embedQuery("Margherita D.O.P Pizza price $19.00 Vegetarian");
  const restChunk: EmbeddedChunk = {
    id: "chk_rest_01",
    documentId: "doc_rest_menu",
    projectId: "proj_restaurant_bella",
    knowledgeBaseId: "menu",
    content: "Margherita D.O.P: San Marzano tomato, fior di latte mozzarella, basil. Price: $19.00. [Vegetarian]",
    embedText: "Margherita D.O.P: San Marzano tomato, fior di latte mozzarella, basil. Price: $19.00. [Vegetarian]",
    embedding: restEmbedding,
    metadata: {
      source: "menu_2025.pdf",
      headingPath: ["Pizzas", "Margherita"],
      category: "Menu",
      chunkIndex: 0,
    },
    contentHash: "hash_rest_01",
  };

  await chunkRepo.insertChunks([collegeChunk, restChunk]);
  console.log("   ✅ Inserted chunks into database for both projects.");

  // 5. Test Strict Cross-Tenant Isolation
  console.log("5️⃣ Testing Cross-Tenant Vector Search Isolation...");
  const searchCollege = await chunkRepo.search(collegeEmbedding, 10, undefined, "exam schedule", "proj_college_sit");
  assert(searchCollege.length > 0, "College search should return college chunks");
  assert(searchCollege.every(c => c.projectId === "proj_college_sit"), "College search MUST NOT contain restaurant chunks");
  assert(!searchCollege.some(c => c.projectId === "proj_restaurant_bella"), "Data Leakage Detected: Restaurant chunk appeared in College search!");
  console.log(`   ✅ College search returned ${searchCollege.length} chunks strictly matching projectId "proj_college_sit".`);

  const searchRest = await chunkRepo.search(restEmbedding, 10, undefined, "Margherita pizza", "proj_restaurant_bella");
  assert(searchRest.length > 0, "Restaurant search should return restaurant chunks");
  assert(searchRest.every(c => c.projectId === "proj_restaurant_bella"), "Restaurant search MUST NOT contain college chunks");
  assert(!searchRest.some(c => c.projectId === "proj_college_sit"), "Data Leakage Detected: College chunk appeared in Restaurant search!");
  console.log(`   ✅ Restaurant search returned ${searchRest.length} chunks strictly matching projectId "proj_restaurant_bella".`);

  // 6. Test Public Widget Token lookup
  console.log("6️⃣ Testing Public Widget Token Resolution...");
  const foundByToken = await projectRepo.findByPublicToken("pk_live_restaurant_bella");
  assert(foundByToken !== null, "Should find project by public widget token");
  assert.strictEqual(foundByToken?.id, "proj_restaurant_bella");
  console.log(`   ✅ Found project "${foundByToken?.name}" via public token "pk_live_restaurant_bella".`);

  console.log("=================================================");
  console.log("🎉 ALL MULTI-TENANT & TENANT ISOLATION TESTS PASSED!");
  console.log("=================================================");
}

runMultiTenantTests().catch(err => {
  console.error("❌ Multi-tenant test failed:", err);
  process.exit(1);
});
