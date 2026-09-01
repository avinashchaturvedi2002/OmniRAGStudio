import type { EmbeddedChunk } from "./chunk.js";

export interface SearchResult extends EmbeddedChunk{
    score:number;
}