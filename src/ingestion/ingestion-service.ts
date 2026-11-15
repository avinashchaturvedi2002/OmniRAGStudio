import path from "node:path";
import type { Express } from "express";

import type { Document, DocumentRecord } from "../types/document.js";
import type { ChunkRepository } from "../db/chunk-repository.js";
import type { LocalEmbeddingProvider } from "../embeddings/local-embedding-provider.js";

import { convertFileToMarkdown, type ConversionOptions } from "../conversion/markdown-converter.js";
import { parseMarkdown } from "../normalization/markdown-parser.js";
import { chunkDocument } from "../chunking/document-chunker.js";
import { embedChunks } from "../embeddings/embed-chunks.js";

export interface IngestionOptions extends ConversionOptions {
  category?: string | undefined;
  title?: string | undefined;
}

export interface IngestedChunkSummary {
  id: string;
  chunkIndex: number;
  headingPath: string[];
  content: string;
  embedText: string;
  contentHash: string;
  charCount: number;
  tokenCount: number;
}

export interface IngestionResult {
  documentId: string;
  knowledgeBaseId: string;
  fileName: string;
  title: string;
  category?: string | undefined;
  chunkCount: number;
  strategyUsed?: string | undefined;
  pageCount?: number | undefined;
  warnings?: string[] | undefined;
  markdown: string;
  chunks: IngestedChunkSummary[];
}

export class IngestionService {
  constructor(
    private readonly provider: LocalEmbeddingProvider,
    private readonly repository: ChunkRepository
  ) {}

  async ingest(
    file: Express.Multer.File,
    knowledgeBaseId: string,
    options?: IngestionOptions
  ): Promise<IngestionResult> {
    // 1. Convert the uploaded scanned notice / file to Markdown via LLM / OCR
    const conversion = await convertFileToMarkdown(file, {
      strategy: options?.strategy,
      provider: options?.provider,
    });
    const markdown = conversion.markdown;

    const docTitle =
      options?.title?.trim() ||
      this.extractTitleFromMarkdown(markdown) ||
      path.parse(file.originalname).name;

    // 2. Create the Document entity
    const document: Document = {
      id: crypto.randomUUID(),
      title: docTitle,
      content: markdown,
      source: file.originalname,
      metadata: {
        sourceType: this.getSourceType(file.originalname),
        fileName: file.originalname,
        mimeType: file.mimetype,
        category: options?.category,
      },
    };

    // 3. Parse Markdown into a section tree AST
    const root = parseMarkdown(markdown);
    if (root.blocks.length === 0 && root.children.length === 0) {
      root.blocks.push({ type: "paragraph", text: markdown });
    }
    root.title = document.title;

    // 4. Create semantic AST chunks
    const chunks = chunkDocument(document, root, knowledgeBaseId);
    if (chunks.length === 0) {
      throw new Error("No chunks could be created from this document.");
    }

    const uploadedAt = new Date().toISOString();

    // Attach rich metadata to chunks
    for (const chunk of chunks) {
      chunk.metadata.documentTitle = document.title;
      chunk.metadata.category = options?.category || "General";
      chunk.metadata.uploadedAt = uploadedAt;
    }

    // 5. Generate embeddings
    const embeddedChunks = await embedChunks(
      chunks,
      this.provider,
      "nano-em1"
    );

    // 6. Persist the chunks in MongoDB
    await this.repository.insertChunks(embeddedChunks);

    // 7. Save document record
    const docRecord: DocumentRecord = {
      id: document.id,
      knowledgeBaseId,
      title: document.title,
      fileName: file.originalname,
      fileSize: file.size || file.buffer.length,
      chunkCount: embeddedChunks.length,
      uploadedAt,
      category: options?.category || "General",
      sourceType: this.getSourceType(file.originalname),
      previewMarkdown: markdown.slice(0, 500),
      strategyUsed: conversion.strategy,
      status: "processed",
    };
    await this.repository.saveDocument(docRecord);

    const chunkSummaries: IngestedChunkSummary[] = embeddedChunks.map((c) => ({
      id: c.id,
      chunkIndex: c.metadata.chunkIndex,
      headingPath: c.metadata.headingPath,
      content: c.content,
      embedText: c.embedText,
      contentHash: c.contentHash,
      charCount: c.content.length,
      tokenCount: Math.ceil(c.content.length / 4),
    }));

    return {
      documentId: document.id,
      knowledgeBaseId,
      fileName: file.originalname,
      title: document.title,
      category: options?.category,
      chunkCount: embeddedChunks.length,
      strategyUsed: conversion.strategy,
      pageCount: conversion.pageCount,
      warnings: conversion.warnings,
      markdown,
      chunks: chunkSummaries,
    };
  }

  async preview(
    file: Express.Multer.File,
    knowledgeBaseId: string,
    options?: IngestionOptions
  ): Promise<Omit<IngestionResult, "documentId"> & { documentId: string }> {
    const conversion = await convertFileToMarkdown(file, {
      strategy: options?.strategy,
      provider: options?.provider,
    });
    const markdown = conversion.markdown;

    const docTitle =
      options?.title?.trim() ||
      this.extractTitleFromMarkdown(markdown) ||
      path.parse(file.originalname).name;

    const document: Document = {
      id: "preview-" + crypto.randomUUID(),
      title: docTitle,
      content: markdown,
      source: file.originalname,
      metadata: {
        sourceType: this.getSourceType(file.originalname),
        fileName: file.originalname,
        mimeType: file.mimetype,
        category: options?.category,
      },
    };

    const root = parseMarkdown(markdown);
    if (root.blocks.length === 0 && root.children.length === 0) {
      root.blocks.push({ type: "paragraph", text: markdown });
    }
    root.title = document.title;

    const chunks = chunkDocument(document, root, knowledgeBaseId);

    const chunkSummaries: IngestedChunkSummary[] = chunks.map((c) => ({
      id: c.id,
      chunkIndex: c.metadata.chunkIndex,
      headingPath: c.metadata.headingPath,
      content: c.content,
      embedText: c.embedText,
      contentHash: c.contentHash,
      charCount: c.content.length,
      tokenCount: Math.ceil(c.content.length / 4),
    }));

    return {
      documentId: document.id,
      knowledgeBaseId,
      fileName: file.originalname,
      title: document.title,
      category: options?.category,
      chunkCount: chunks.length,
      strategyUsed: conversion.strategy,
      pageCount: conversion.pageCount,
      warnings: conversion.warnings,
      markdown,
      chunks: chunkSummaries,
    };
  }

  private extractTitleFromMarkdown(markdown: string): string | null {
    // Try to find first H1 or H2
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }
    const h2Match = markdown.match(/^##\s+(?:Subject:\s*)?(.+)$/m);
    if (h2Match && h2Match[1]) {
      return h2Match[1].trim();
    }
    return null;
  }

  private getSourceType(filename: string): Document["metadata"]["sourceType"] {
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
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".webp":
        return "image";
      default:
        return "text";
    }
  }
}
