export type sourceType="markdown" | "pdf" | "docx" | "html" | "text"

export interface DocumentMetadata {
  sourceType:sourceType;
  fileName?: string;
  mimeType?: string;
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
  content: string;
  children: DocumentSection[];
}