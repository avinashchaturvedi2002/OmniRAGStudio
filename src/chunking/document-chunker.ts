import type { Document, DocumentSection } from "../types/document.js";
import type { Chunk } from "../types/chunk.js";

export function chunkDocument(document:Document,sections:DocumentSection[],knowledgeBaseId: string):Chunk[]{
    const chunks:Chunk[]=[];
    for (const section of sections){
        processSection(section,document,[],chunks,knowledgeBaseId);
    }
    return chunks;
}

function processSection(section:DocumentSection,document:Document,parentPath:string[],chunks:Chunk[],knowledgeBaseId: string):void{
    const currentPath=[...parentPath,section.title]
    if(section.content.trim().length>0)
    {
        chunks.push({
            id:crypto.randomUUID(),
            documentId:document.id,
            knowledgeBaseId,
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
        processSection(child,document,currentPath,chunks,knowledgeBaseId);
    }
}