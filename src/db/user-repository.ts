import type { Collection } from "mongodb";
import type { User, SafeUser } from "../types/auth.js";

export class UserRepository {
  constructor(private readonly collection: Collection<User>) {}

  async createUser(user: User): Promise<SafeUser> {
    await this.collection.insertOne(user as any);
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.collection.findOne({ email: email.toLowerCase().trim() });
  }

  async findById(id: string): Promise<User | null> {
    return this.collection.findOne({ id });
  }

  async findSafeById(id: string): Promise<SafeUser | null> {
    const user = await this.findById(id);
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async countUsers(): Promise<number> {
    return this.collection.countDocuments();
  }
}
