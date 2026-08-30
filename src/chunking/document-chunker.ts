import type { Document, DocumentSection } from "../types/document.js";
import type { Chunk } from "../types/chunk.js";

export function chunkDocument(document:Document,sections:DocumentSection[]):Chunk[]{
    const chunks:Chunk[]=[];
    for (const section of sections){
        processSection(section,document,[],chunks);
    }
    return chunks;
}

function processSection(section:DocumentSection,document:Document,parentPath:string[],chunks:Chunk[]):void{
    const currentPath=[...parentPath,section.title]
    if(section.content.trim().length>0)
    {
        chunks.push({
            id:crypto.randomUUID(),
            documentId:document.id,
            content:section.content.trim(),
            metadata:{
                headingPath:currentPath,
                source:document.source,
                chunkIndex:chunks.length
            }
        })
    }
    for (const child of section.children)
    {
        processSection(child,document,currentPath,chunks);
    }
}