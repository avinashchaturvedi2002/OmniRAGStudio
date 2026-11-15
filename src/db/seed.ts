import crypto from "node:crypto";
import type { UserRepository } from "./user-repository.js";
import type { ProjectRepository } from "./project-repository.js";
import { hashPassword } from "../auth/auth-utils.js";
import { DOMAIN_PRESETS } from "../projects/domain-presets.js";
import type { Project } from "../types/project.js";

export async function seedInitialData(
  userRepo: UserRepository,
  projectRepo: ProjectRepository
): Promise<{ userCreated: boolean; projectsCreated: number }> {
  let userCreated = false;
  let projectsCreated = 0;

  let adminUser = await userRepo.findByEmail("admin@campus.edu");
  let adminUserId = "usr_demo_admin";

  if (!adminUser) {
    const now = new Date().toISOString();
    await userRepo.createUser({
      id: adminUserId,
      email: "admin@campus.edu",
      passwordHash: hashPassword("Password123"),
      name: "Campus Admin",
      companyName: "State Institute of Technology",
      plan: "enterprise",
      createdAt: now,
      updatedAt: now,
    });
    userCreated = true;
    console.log("🌱 Default demo account seeded: admin@campus.edu / Password123");
  } else {
    adminUserId = adminUser.id;
  }

  // Ensure default demo projects exist
  const existingCollege = await projectRepo.findById("college-demo");
  if (!existingCollege) {
    const now = new Date().toISOString();
    const collegePreset = DOMAIN_PRESETS.college;
    const collegeProject: Project = {
      id: "college-demo",
      userId: adminUserId,
      name: "State Institute of Technology Notice Bot",
      category: "college",
      description: "Official student circulars, examination schedules & fee notices",
      ingestionPrompt: collegePreset.ingestionPrompt,
      aiPersona: collegePreset.aiPersona,
      widgetConfig: {
        ...collegePreset.widgetConfig,
        title: "SIT Notice Assistant",
        allowedDomains: ["*"],
      },
      credentials: {
        publicToken: "pk_live_college_demo_token_2025",
        secretKey: "sk_live_" + crypto.randomBytes(24).toString("hex"),
      },
      createdAt: now,
      updatedAt: now,
    };
    await projectRepo.createProject(collegeProject);
    projectsCreated++;
  }

  const existingRestaurant = await projectRepo.findById("restaurant-demo");
  if (!existingRestaurant) {
    const now = new Date().toISOString();
    const restPreset = DOMAIN_PRESETS.restaurant;
    const restProject: Project = {
      id: "restaurant-demo",
      userId: adminUserId,
      name: "Bella Italia Ristorante",
      category: "restaurant",
      description: "Woodfired pizza, pasta, wines, dietary tags & table reservation concierge",
      ingestionPrompt: restPreset.ingestionPrompt,
      aiPersona: restPreset.aiPersona,
      widgetConfig: {
        ...restPreset.widgetConfig,
        title: "Bella Italia Concierge",
        allowedDomains: ["*"],
      },
      credentials: {
        publicToken: "pk_live_restaurant_demo_token_2025",
        secretKey: "sk_live_" + crypto.randomBytes(24).toString("hex"),
      },
      createdAt: now,
      updatedAt: now,
    };
    await projectRepo.createProject(restProject);
    projectsCreated++;
  }

  const existingCorp = await projectRepo.findById("corporate-demo");
  if (!existingCorp) {
    const now = new Date().toISOString();
    const corpPreset = DOMAIN_PRESETS.corporate;
    const corpProject: Project = {
      id: "corporate-demo",
      userId: adminUserId,
      name: "Acme Corp Employee Policy Hub",
      category: "corporate",
      description: "Workplace guidelines, leave policies, expense reimbursement & health benefits",
      ingestionPrompt: corpPreset.ingestionPrompt,
      aiPersona: corpPreset.aiPersona,
      widgetConfig: {
        ...corpPreset.widgetConfig,
        title: "Acme HR Assistant",
        allowedDomains: ["*"],
      },
      credentials: {
        publicToken: "pk_live_corporate_demo_token_2025",
        secretKey: "sk_live_" + crypto.randomBytes(24).toString("hex"),
      },
      createdAt: now,
      updatedAt: now,
    };
    await projectRepo.createProject(corpProject);
    projectsCreated++;
  }

  if (projectsCreated > 0) {
    console.log(`🌱 Seeded ${projectsCreated} default startup demo projects (College, Restaurant, Corporate).`);
  }

  return { userCreated, projectsCreated };
}
