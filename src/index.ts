import "dotenv/config"
import { loadMarkdown } from "./ingestion/markdown-loader.js";
import { parseMarkdown } from "./normalization/markdown-parser.js";
import { chunkDocument } from "./chunking/document-chunker.js";
import { LocalEmbeddingProvider } from "./embeddings/local-embedding-provider.js";
import { embedChunks } from "./embeddings/embed-chunks.js";
import { getDatabase } from "./db/mongodb.js";
import type { EmbeddedChunk } from "./types/chunk.js";
import { ChunkRepository } from "./db/chunk-repository.js";
const filePath="./examples/documents/operating-systems.md"
const document = await loadMarkdown(
  filePath
);

const sections=parseMarkdown(document.content);

const chunks=chunkDocument(document,sections);

const provider=new LocalEmbeddingProvider();

const embeddedChunks=await embedChunks(chunks,provider);

const db=await getDatabase();

const collection=db.collection<EmbeddedChunk>("chunks");

const repository=new ChunkRepository(collection);

// await repository.insertChunks(embeddedChunks);

const query="How does virtual Memory Work?"

const queryEmbedding=await provider.embedQuery(query);

const results=await repository.search(queryEmbedding)

for (const result of results){
  console.log("\n-------------------------");

  console.log(
    result.score.toFixed(4),
    result.metadata.headingPath.join(" > ")
  );

  console.log(result.content);
}