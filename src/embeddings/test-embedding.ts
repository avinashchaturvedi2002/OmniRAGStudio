import "dotenv/config";
import { OpenAIEmbeddingProvider } from "./open-ai-embeeding-provider.js";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not configured");
}

const provider = new OpenAIEmbeddingProvider(apiKey);

const text =
  "Virtual memory allows a system to use disk space as an extension of physical memory.";

const embedding = await provider.embed(text);

console.log("Embedding dimensions:", embedding.length);
console.log("First 10 values:", embedding.slice(0, 10));