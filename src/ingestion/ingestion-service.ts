import path from "node:path";
import type { Express } from "express";

import type { Document } from "../types/document.js";
import type { ChunkRepository } from "../db/chunk-repository.js";
import type { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";

import { convertFileToMarkdown } from "../conversion/markdown-converter.js";
import { parseMarkdown } from "../normalization/markdown-parser.js";
import { chunkDocument } from "../chunking/document-chunker.js";
import { embedChunks } from "../embeddings/embed-chunks.js";

export class IngestionService {
  constructor(
    private readonly provider: LocalEmbeddingProvider,
    private readonly repository: ChunkRepository
  ) {}

  async ingest(
    file: Express.Multer.File,
    knowledgeBaseId: string
  ) {
    // 1. Convert the uploaded file to Markdown.
    const conversion = await convertFileToMarkdown(file);
    const markdown = conversion.markdown;

    // 2. Create the Document using the converted content.
    const document: Document = {
      id: crypto.randomUUID(),
      title: path.parse(file.originalname).name,
      content: markdown,
      source: file.originalname,
      metadata: {
        sourceType: this.getSourceType(file.originalname),
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
    };

    // 3. Parse Markdown into sections.
    const sections = parseMarkdown(markdown);

    // Handle files that contain no Markdown headings.
    const usableSections = sections.length > 0
      ? sections
      : [{
          title: document.title,
          level: 1,
          content: markdown,
          children: [],
        }];

    // 4. Create chunks.
    const chunks = chunkDocument(
      document,
      usableSections,
      knowledgeBaseId
    );

    if (chunks.length === 0) {
      throw new Error("No chunks could be created");
    }

    // 5. Generate embeddings.
    const embeddedChunks = await embedChunks(
      chunks,
      this.provider,
      "nano-em1"
    );

    // 6. Persist the chunks.
    await this.repository.insertChunks(embeddedChunks);

    return {
      documentId: document.id,
      knowledgeBaseId,
      fileName: file.originalname,
      chunkCount: embeddedChunks.length,
    };
  }

  private getSourceType(
    filename: string
  ): Document["metadata"]["sourceType"] {
    const extension = path.extname(filename).toLowerCase();

    switch (extension) {
      case ".pdf":
        return "pdf";
      case ".docx":
        return "docx";
      case ".html":
      case ".htm":
        return "html";
      case ".md":
      case ".markdown":
        return "markdown";
      default:
        return "text";
    }
  }
}