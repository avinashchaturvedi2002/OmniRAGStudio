import OpenAI from "openai";
import type { EmbeddingProvider } from "./embedding-provider.js";

export class OpenAIEmbeddingProvider implements EmbeddingProvider{
    private readonly client:OpenAI;
    constructor(apiKey:string)
    {
        this.client=new OpenAI({apiKey});
    }
    async embed(text: string,model:string="text-embedding-3-small"): Promise<number[]> {
        const response=await this.client.embeddings.create({
            model:model,
            input:text,
        })
        console.log(response);
        const embedding=response.data[0]?.embedding;
        if(!embedding)
            throw new Error("No embedding returned from OpenAI")
        return embedding;
    }

    async embedBatch(texts: string[],model:string="text-embedding-3-small"): Promise<number[][]> {
        const response=await this.client.embeddings.create({
            model:model,
            input:texts,
        })
        return response.data.map((item)=>item.embedding);
    }
}