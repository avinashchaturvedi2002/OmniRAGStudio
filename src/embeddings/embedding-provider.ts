export interface EmbeddingProvider{
    embed(text:string,model:string):Promise<number[]>;
    embedBatch(texts:string[],model:string):Promise<number[][]>;
}