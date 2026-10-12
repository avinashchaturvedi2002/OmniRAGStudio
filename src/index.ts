import "dotenv/config";

import { loadMarkdown } from "./ingestion/markdown-loader.js";
import { parseMarkdown } from "./normalization/markdown-parser.js";
import { chunkDocument } from "./chunking/document-chunker.js";
import { LocalEmbeddingProvider } from "./embeddings/local-embedding-provider.js";
import { embedChunks } from "./embeddings/embed-chunks.js";
import { getDatabase } from "./db/mongodb.js";
import type { EmbeddedChunk } from "./types/chunk.js";
import { ChunkRepository } from "./db/chunk-repository.js";
import { LlmReranker } from "./reranking/llm-reranker.js";
import { AnswerGenerator } from "./llm/answer-generator.js";

const filePath = "./examples/documents/operating-systems.md";


// --------------------------------------------------
// 1. Load document
// --------------------------------------------------

const document = await loadMarkdown(filePath);


// --------------------------------------------------
// 2. Parse document
// --------------------------------------------------

const sections = parseMarkdown(document.content);


// --------------------------------------------------
// 3. Chunk document
// --------------------------------------------------

const chunks = chunkDocument(document, sections);


// --------------------------------------------------
// 4. Generate embeddings
// --------------------------------------------------

const provider = new LocalEmbeddingProvider();

const embeddedChunks = await embedChunks(
  chunks,
  provider
);


// --------------------------------------------------
// 5. Connect to MongoDB
// --------------------------------------------------

const db = await getDatabase();

const collection =
  db.collection<EmbeddedChunk>("chunks");

const repository =
  new ChunkRepository(collection);


// --------------------------------------------------
// 6. Insert chunks
// --------------------------------------------------

// await repository.insertChunks(embeddedChunks);


// --------------------------------------------------
// 7. User query
// --------------------------------------------------

const query = "What is virtual memory?";


// --------------------------------------------------
// 8. Embed query
// --------------------------------------------------

const queryEmbedding =
  await provider.embedQuery(query);


// --------------------------------------------------
// 9. Vector retrieval
// --------------------------------------------------

const results =
  await repository.search(
    queryEmbedding,
    20
  );


console.log("\n================================");
console.log("VECTOR SEARCH RESULTS");
console.log("================================");


for (const result of results) {

  console.log("\n-------------------------");

  console.log(
    result.score.toFixed(4),
    result.metadata.headingPath.join(" > ")
  );

  console.log(result.content);
}


// --------------------------------------------------
// 10. LLM relevance filtering
// --------------------------------------------------

const reranker = new LlmReranker();

const relevantChunks =
  await reranker.rerank(
    query,
    results
  );

console.log("\n================================");
console.log("LLM RELEVANT CHUNKS");
console.log("================================");

for (const result of relevantChunks) {
  console.log("\n-------------------------");
  console.log(result.metadata.headingPath.join(" > "));
  console.log(result.content);
}

console.log("\n================================");
console.log("GENERATED ANSWER");
console.log("================================");

if (relevantChunks.length === 0) {
  console.log(
    "I couldn't find enough relevant information in the knowledge base to answer that question."
  );
} else {
  const answerGenerator = new AnswerGenerator();

  const answer = await answerGenerator.generate(
    query,
    relevantChunks
  );

  console.log(answer);
}
