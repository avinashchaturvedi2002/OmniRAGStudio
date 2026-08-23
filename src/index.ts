import { loadMarkdown } from "./ingestion/markdown-loader.js";

const document = await loadMarkdown(
  "./examples/documents/operating-systems.md"
);

console.log(document);