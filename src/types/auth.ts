export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  companyName?: string | undefined;
  plan: "free" | "starter" | "business" | "enterprise";
  createdAt: string;
  updatedAt: string;
}

export type SafeUser = Omit<User, "passwordHash">;

export interface AuthSession {
  user: SafeUser;
  token: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  exp: number;
}
