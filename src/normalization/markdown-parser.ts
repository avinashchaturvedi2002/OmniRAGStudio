import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";
import type { Block, BlockType, DocumentSection } from "../types/document.js";

const parser = unified().use(remarkParse).use(remarkGfm);

function blockType(node: RootContent): BlockType {
  switch (node.type) {
    case "paragraph":
      return "paragraph";
    case "list":
      return "list";
    case "table":
      return "table";
    case "code":
      return "code";
    case "blockquote":
      return "quote";
    default:
      return "other";
  }
}

/**
 * Parses markdown into a section tree.
 *
 * The returned root is a synthetic level-0 section with an empty title.
 * Its `blocks` hold any content that appears before the first heading,
 * and its `children` are the top-level sections.
 *
 * Block text is sliced from the original markdown, so tables, lists,
 * links, bold text and code are preserved exactly as written.
 */
export function parseMarkdown(markdown: string): DocumentSection {
  const tree = parser.parse(markdown) as Root;

  const root: DocumentSection = {
    title: "",
    level: 0,
    blocks: [],
    children: [],
  };
  const stack: DocumentSection[] = [root];

  for (const node of tree.children) {
    if (node.type === "heading") {
      const title = toString(node).trim();

      // Empty headings (e.g. "##" with no text) carry no information.
      if (!title) continue;

      const section: DocumentSection = {
        title,
        level: node.depth,
        blocks: [],
        children: [],
      };

      // Pop until the top of the stack is a shallower heading.
      // This handles skipped levels (H1 -> H3) and level resets.
      while (stack.length > 1 && (stack[stack.length - 1]?.level ?? 0) >= section.level) {
        stack.pop();
      }

      (stack[stack.length - 1] ?? root).children.push(section);
      stack.push(section);
      continue;
    }

    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start == null || end == null) continue;

    const text = markdown.slice(start, end).trim();
    if (!text) continue;

    const block: Block = { type: blockType(node), text };
    (stack[stack.length - 1] ?? root).blocks.push(block);
  }

  return root;
}