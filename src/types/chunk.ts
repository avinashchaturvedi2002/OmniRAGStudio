export interface ChunkMetadata {
  headingPath: string[];
  source: string;
  chunkIndex: number;
  documentTitle?: string | undefined;
  category?: string | undefined;
  uploadedAt?: string | undefined;
}

export interface Chunk {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  metadata: ChunkMetadata;
  embedText: string;
  contentHash: string; 
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}
