import fs from "node:fs/promises"
import path from "node:path"
import type { Document } from "../types/document.js"

export async function loadMarkdown(filePath:string):Promise<Document>{
    const content=await fs.readFile(filePath,"utf-8");

    return{
        id:crypto.randomUUID(),
        title:path.basename(filePath,".md"),
        content:content,
        source:filePath,
        metadata:{
            sourceType:"markdown",
            fileName:path.basename(filePath),
            mimeType:"text/markdown"
        }
    }
}