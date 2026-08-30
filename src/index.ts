import { loadMarkdown } from "./ingestion/markdown-loader.js";
import { parseMarkdown } from "./normalization/markdown-parser.js";
import { chunkDocument } from "./chunking/document-chunker.js";
const filePath="./examples/documents/operating-systems.md"
const document = await loadMarkdown(
  filePath
);

const sections=parseMarkdown(document.content);

const chunks=chunkDocument(document,sections);

console.dir(chunks,{depth:null});