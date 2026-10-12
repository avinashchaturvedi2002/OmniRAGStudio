from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from colbert.infra import ColBERTConfig
from colbert.modeling.checkpoint import Checkpoint
import torch

# --------------------------------------------------
# 1. Create FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="RAG Engine ColBERT Service",
)


# --------------------------------------------------
# 2. Load ColBERT model ONCE
# --------------------------------------------------

print("Loading ColBERT...")

colbert_model = Checkpoint(
    "colbert-ir/colbertv2.0",
    colbert_config=ColBERTConfig(
        doc_maxlen=180,
        nbits=2,
    ),
)

print("ColBERT loaded successfully")


# --------------------------------------------------
# 3. Request schema
# --------------------------------------------------

class RerankRequest(BaseModel):
    query: str
    documents: list[str]

@app.post("/colbert-rerank")
def colbert_rerank(request: RerankRequest):

    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="No documents provided"
        )

    # Encode query
    Q = colbert_model.queryFromText([request.query])

    # Encode documents
    D = colbert_model.docFromText(request.documents)

    results = []

    for index, document_embedding in enumerate(D):

        # Q shape:
        # [1, query_tokens, embedding_dim]
        #
        # document_embedding shape:
        # [doc_tokens, embedding_dim]

        query_embedding = Q[0]

        # Calculate token-to-token similarity
        similarity = torch.matmul(
            query_embedding,
            document_embedding.T
        )

        # MaxSim:
        # For every query token, take its best matching
        # document token.
        max_similarity = similarity.max(dim=1).values

        # Sum the best matches for all query tokens
        score = max_similarity.sum().item()

        results.append({
            "index": index,
            "score": score
        })

    # Highest score first
    results.sort(
        key=lambda x: x["score"],
        reverse=True
    )

    return {
        "results": results
    }