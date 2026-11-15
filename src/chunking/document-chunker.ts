import { createHash } from "node:crypto";
import type { Block, Document, DocumentSection } from "../types/document.js";
import type { Chunk } from "../types/chunk.js";

export interface ChunkOptions {
  /** Hard ceiling for a chunk, in tokens. */
  maxTokens: number;
  /** Chunks smaller than this are merged with a neighbour when possible. */
  minTokens: number;
  /** Token counter. Swap in your embedder's tokenizer for accuracy. */
  countTokens: (text: string) => number;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxTokens: 600,
  minTokens: 80,
  countTokens: (text) => Math.ceil(text.length / 4),
};

interface Segment {
  path: string[];
  content: string;
}

export function chunkDocument(
  document: Document,
  root: DocumentSection,
  knowledgeBaseId: string,
  overrides: Partial<ChunkOptions> = {},
): Chunk[] {
  const options: ChunkOptions = { ...DEFAULT_OPTIONS, ...overrides };

  const segments: Segment[] = [];
  collectSegments(root, [], segments, options);

  const merged = mergeSmallSegments(segments, options);

  return merged.map((group, index) => {
    const { path, content } = renderGroup(group);
    const embedText = (path.length ? path.join(" > ") + "\n\n" : "") + content;

    return {
      id: crypto.randomUUID(),
      documentId: document.id,
      knowledgeBaseId,
      content,
      embedText,
      contentHash: createHash("sha256").update(embedText).digest("hex"),
      metadata: {
        headingPath: path,
        source: document.source,
        chunkIndex: index,
      },
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Walking the section tree                                                   */
/* -------------------------------------------------------------------------- */

function collectSegments(
  section: DocumentSection,
  parentPath: string[],
  out: Segment[],
  options: ChunkOptions,
): void {
  const path = section.title ? [...parentPath, section.title] : parentPath;

  for (const content of packBlocks(section.blocks, options)) {
    out.push({ path, content });
  }

  for (const child of section.children) {
    collectSegments(child, path, out, options);
  }
}

/* -------------------------------------------------------------------------- */
/* Packing blocks into size-bounded pieces                                    */
/* -------------------------------------------------------------------------- */

function packBlocks(blocks: Block[], options: ChunkOptions): string[] {
  const { maxTokens, countTokens } = options;
  const out: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = "";
  };

  for (const block of blocks) {
    if (countTokens(block.text) > maxTokens) {
      // Oversized block: emit what we have, then split the block itself.
      flush();
      out.push(...splitOversizedBlock(block, options));
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${block.text}` : block.text;
    if (buffer && countTokens(candidate) > maxTokens) {
      flush();
      buffer = block.text;
    } else {
      buffer = candidate;
    }
  }

  flush();
  return out;
}

function splitOversizedBlock(block: Block, options: ChunkOptions): string[] {
  switch (block.type) {
    case "table":
      return splitTable(block.text, options);
    case "code":
      return splitCode(block.text, options);
    case "list":
      return splitByLines(block.text, options);
    default:
      return splitProse(block.text, options);
  }
}

/** Splits a table by rows, repeating the header row in every part. */
function splitTable(text: string, options: ChunkOptions): string[] {
  const { maxTokens, countTokens } = options;
  const lines = text.split("\n");

  // A GFM table needs a header row and a delimiter row.
  if (lines.length < 3) return splitByLines(text, options);

  const header = lines.slice(0, 2).join("\n");
  const parts: string[] = [];
  let rows: string[] = [];

  for (const row of lines.slice(2)) {
    const candidate = [header, ...rows, row].join("\n");
    if (rows.length > 0 && countTokens(candidate) > maxTokens) {
      parts.push([header, ...rows].join("\n"));
      rows = [];
    }
    rows.push(row);
  }

  if (rows.length > 0) parts.push([header, ...rows].join("\n"));
  return parts;
}

/** Splits fenced code by lines, re-wrapping each part in its own fence. */
function splitCode(text: string, options: ChunkOptions): string[] {
  const lines = text.split("\n");
  const first = lines[0] ?? "";
  const fenceMatch = first.match(/^(\s*)(`{3,}|~{3,})(.*)$/);

  if (!fenceMatch) return splitByLines(text, options);

  const fence = fenceMatch[2] ?? "```";
  const info = fenceMatch[3] ?? "";
  const last = lines[lines.length - 1]?.trim() ?? "";
  const hasClosing =
    lines.length > 1 && last.startsWith(fence.charAt(0).repeat(3));
  const body = lines.slice(1, hasClosing ? -1 : undefined).join("\n");

  // Reserve room for the fence lines so wrapped parts stay under the limit.
  const innerOptions: ChunkOptions = {
    ...options,
    maxTokens: Math.max(20, options.maxTokens - 10),
  };

  return splitByLines(body, innerOptions).map(
    (part) => `${fence}${info}\n${part}\n${fence}`,
  );
}

/** Packs lines into parts, hard-splitting any single line that is too long. */
function splitByLines(text: string, options: ChunkOptions): string[] {
  const { maxTokens, countTokens } = options;
  const parts: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) parts.push(buffer);
    buffer = "";
  };

  for (const line of text.split("\n")) {
    if (countTokens(line) > maxTokens) {
      flush();
      parts.push(...hardSplit(line, options));
      continue;
    }

    const candidate = buffer ? `${buffer}\n${line}` : line;
    if (buffer && countTokens(candidate) > maxTokens) {
      flush();
      buffer = line;
    } else {
      buffer = candidate;
    }
  }

  flush();
  return parts;
}

/** Splits prose by paragraph, then sentence, then raw characters. */
function splitProse(text: string, options: ChunkOptions): string[] {
  const { maxTokens, countTokens } = options;

  interface Unit {
    text: string;
    separator: string; // what joins this unit to the previous one
  }

  const units: Unit[] = [];
  const paragraphs = text.split(/\n{2,}/);

  paragraphs.forEach((paragraph, pIndex) => {
    const paragraphSep = pIndex === 0 ? "" : "\n\n";

    if (countTokens(paragraph) <= maxTokens) {
      units.push({ text: paragraph, separator: paragraphSep });
      return;
    }

    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    sentences.forEach((sentence, sIndex) => {
      const separator = sIndex === 0 ? paragraphSep : " ";
      if (countTokens(sentence) <= maxTokens) {
        units.push({ text: sentence, separator });
      } else {
        hardSplit(sentence, options).forEach((piece, i) => {
          units.push({ text: piece, separator: i === 0 ? separator : " " });
        });
      }
    });
  });

  const parts: string[] = [];
  let buffer = "";

  for (const unit of units) {
    const candidate = buffer ? buffer + unit.separator + unit.text : unit.text;
    if (buffer && countTokens(candidate) > maxTokens) {
      parts.push(buffer);
      buffer = unit.text;
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim()) parts.push(buffer);
  return parts;
}

/** Last resort for text with no usable break points. Splits on whitespace when possible. */
function hardSplit(text: string, options: ChunkOptions): string[] {
  const { maxTokens, countTokens } = options;
  const parts: string[] = [];
  let remaining = text;

  // Rough characters-per-token estimate from the text itself.
  const totalTokens = Math.max(1, countTokens(text));
  const charsPerToken = Math.max(1, text.length / totalTokens);
  const maxChars = Math.max(50, Math.floor(maxTokens * charsPerToken * 0.9));

  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(" ", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Merging tiny segments                                                      */
/* -------------------------------------------------------------------------- */

function mergeSmallSegments(
  segments: Segment[],
  options: ChunkOptions,
): Segment[][] {
  const { minTokens, maxTokens, countTokens } = options;
  const groups: Segment[][] = [];

  for (const segment of segments) {
    const group = groups[groups.length - 1];

    if (group && canMerge(group, segment)) {
      const groupTokens = countTokens(renderGroup(group).content);
      const segmentTokens = countTokens(segment.content);
      const combined = groupTokens + segmentTokens + 10; // headroom for labels

      if (
        (groupTokens < minTokens || segmentTokens < minTokens) &&
        combined <= maxTokens
      ) {
        group.push(segment);
        continue;
      }
    }

    groups.push([segment]);
  }

  return groups;
}

/** Only merge segments that live under the same parent heading. */
function canMerge(group: Segment[], next: Segment): boolean {
  const last = group[group.length - 1];
  if (!last) return false;
  return samePath(last.path.slice(0, -1), next.path.slice(0, -1));
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

function commonPrefix(paths: string[][]): string[] {
  const first = paths[0] ?? [];
  const prefix: string[] = [];

  for (let i = 0; i < first.length; i++) {
    const part = first[i];
    if (part !== undefined && paths.every((p) => p[i] === part)) {
      prefix.push(part);
    } else {
      break;
    }
  }

  return prefix;
}

/**
 * Turns a group of segments into one chunk body. When the segments come
 * from different headings, each is labelled with its own heading so the
 * information is not lost after merging.
 */
function renderGroup(group: Segment[]): { path: string[]; content: string } {
  const only = group[0];
  if (!only) return { path: [], content: "" };
  if (group.length === 1) {
    return { path: only.path, content: only.content };
  }

  const paths = group.map((s) => s.path);
  const prefix = commonPrefix(paths);
  const allSame = paths.every((p) => samePath(p, only.path));

  if (allSame) {
    return {
      path: only.path,
      content: group.map((s) => s.content).join("\n\n"),
    };
  }

  const content = group
    .map((segment) => {
      const label = segment.path.slice(prefix.length).join(" > ");
      return label ? `**${label}**\n${segment.content}` : segment.content;
    })
    .join("\n\n");

  return { path: prefix, content };
}