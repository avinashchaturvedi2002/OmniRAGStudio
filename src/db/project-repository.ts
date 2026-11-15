import type { Collection, Filter } from "mongodb";
import type { Project } from "../types/project.js";

export class ProjectRepository {
  constructor(private readonly collection: Collection<Project>) {}

  async createProject(project: Project): Promise<Project> {
    await this.collection.insertOne(project as any);
    return project;
  }

  async findById(id: string): Promise<Project | null> {
    return this.collection.findOne({ id });
  }

  async findByPublicToken(publicToken: string): Promise<Project | null> {
    return this.collection.findOne({ "credentials.publicToken": publicToken });
  }

  async findByUserId(userId: string): Promise<Project[]> {
    return this.collection.find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  async updateProject(id: string, update: Partial<Project>): Promise<void> {
    await this.collection.updateOne(
      { id },
      { $set: { ...update, updatedAt: new Date().toISOString() } }
    );
  }

  async deleteProject(id: string): Promise<boolean> {
    const res = await this.collection.deleteOne({ id });
    return res.deletedCount > 0;
  }

  async countProjects(): Promise<number> {
    return this.collection.countDocuments();
  }
}
