export type SourceType = "markdown" | "pdf" | "docx" | "html" | "text" | "image";

export type BlockType = "paragraph" | "list" | "table" | "code" | "quote" | "other";
export interface Block { type: BlockType; text: string }

export interface DocumentMetadata {
  sourceType: SourceType;
  fileName?: string | undefined;
  mimeType?: string | undefined;
  category?: string | undefined;
  projectId?: string | undefined;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  source: string;
  metadata: DocumentMetadata;
}

export interface DocumentSection {
  title: string;
  level: number;
  blocks: Block[];          
  children: DocumentSection[];
}

export interface DocumentRecord {
  id: string;
  projectId?: string | undefined;
  userId?: string | undefined;
  knowledgeBaseId: string;
  title: string;
  fileName: string;
  fileSize: number;
  chunkCount: number;
  uploadedAt: string;
  category?: string | undefined;
  sourceType: SourceType;
  previewMarkdown?: string | undefined;
  strategyUsed?: string | undefined;
  status: "processed" | "failed";
}
