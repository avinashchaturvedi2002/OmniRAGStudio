export interface ChunkMetadata {
  headingPath: string[];
  source: string;
  chunkIndex: number;
}

export interface Chunk {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  metadata: ChunkMetadata;
}

export interface EmbeddedChunk extends Chunk{
  embedding:number[]
}