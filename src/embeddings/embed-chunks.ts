import type { Chunk, EmbeddedChunk } from "../types/chunk.js";
import type { EmbeddingProvider } from "./embedding-provider.js";

export async function embedChunks(chunks:Chunk[],provider:EmbeddingProvider):Promise<EmbeddedChunk[]>{
    const texts=chunks.map(chunk=>createEmbeddingText(chunk.metadata.headingPath,chunk.content))
    const embeddings=await provider.embedDocuments(texts);
    return chunks.map((chunk,index)=>{
        const embedding=embeddings[index];
        if (!embedding) {
    throw new Error(
        `Missing embedding for chunk at index ${index}`
    );
}
        return {...chunk,
            embedding
        }
    })
}

function createEmbeddingText(heading:string[],content:string):string{
    const headingPath=heading.join(">");
    return `${headingPath}\n\n${content}`
    
}

