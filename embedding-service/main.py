from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import CrossEncoder
from model import NanoEm1Model


# --------------------------------------------------
# 1. Create FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="RAG Engine Embedding Service",
)


# --------------------------------------------------
# 2. Load embedding model ONCE
# --------------------------------------------------

embedding_model = NanoEm1Model()
reranker_model = CrossEncoder(
    "cross-encoder/ms-marco-MiniLM-L12-v2"
)



# --------------------------------------------------
# 3. Request schema
# --------------------------------------------------

class EmbeddingRequest(BaseModel):
    texts: list[str]
    is_query: bool = False

class RerankRequest(BaseModel):
    query: str
    documents: list[str]
# --------------------------------------------------
# 4. Embedding endpoint
# --------------------------------------------------

@app.post("/embed")
def embed(request: EmbeddingRequest):

    # Validate request
    if not request.texts:
        raise HTTPException(
            status_code=400,
            detail="texts cannot be empty",
        )

    # Query embedding
    if request.is_query:

        # We currently expect a single query.
        if len(request.texts) != 1:
            raise HTTPException(
                status_code=400,
                detail="A query request must contain exactly one text",
            )

        embedding = embedding_model.embed_query(
            request.texts[0]
        )

        return {
            "embeddings": [
                embedding.tolist()
            ]
        }

    # Document embeddings
    embeddings = embedding_model.embed_documents(
        request.texts
    )

    return {
        "embeddings": embeddings.tolist()
    }

@app.post("/rerank")
def rerank(request: RerankRequest):

    # Validate request
    if not request.query.strip():
        raise HTTPException(
            status_code=400,
            detail="query cannot be empty",
        )

    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="documents cannot be empty",
        )

    # Create query-document pairs
    pairs = [
        (request.query, document)
        for document in request.documents
    ]

    # Get relevance scores
    scores = reranker_model.predict(pairs)

    # Attach original document index
    results = [
        {
            "index": i,
            "score": float(score),
        }
        for i, score in enumerate(scores)
    ]

    # Highest relevance first
    results.sort(
        key=lambda x: x["score"],
        reverse=True,
    )

    return {
        "results": results
    }
