from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

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


# --------------------------------------------------
# 3. Request schema
# --------------------------------------------------

class EmbeddingRequest(BaseModel):
    texts: list[str]
    is_query: bool = False


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

