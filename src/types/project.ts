export type ProjectCategory = "college" | "restaurant" | "corporate" | "custom";

export interface ProjectAiPersona {
  systemPrompt: string;
  tone: "professional" | "friendly" | "concise" | "formal";
  temperature: number;
  fallbackMessage: string;
}

export interface ProjectWidgetConfig {
  title: string;
  subtitle?: string | undefined;
  primaryColor: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
  allowedDomains: string[];
}

export interface ProjectCredentials {
  publicToken: string;
  secretKey: string;
}

export interface ProjectStats {
  documentCount: number;
  chunkCount: number;
  totalQueries: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  category: ProjectCategory;
  description: string;
  ingestionPrompt: string;
  aiPersona: ProjectAiPersona;
  widgetConfig: ProjectWidgetConfig;
  credentials: ProjectCredentials;
  stats?: ProjectStats | undefined;
  createdAt: string;
  updatedAt: string;
}
