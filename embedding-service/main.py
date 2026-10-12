import os
import tempfile
from pathlib import Path
from markitdown import MarkItDown
from fastapi import FastAPI, HTTPException, File, UploadFile
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

markdown_converter = MarkItDown(enable_plugins=False)

SUPPORTED_EXTENSIONS = {
    ".pdf", ".docx", ".pptx", ".xlsx", ".xls",
    ".html", ".htm", ".txt", ".md", ".markdown",
    ".csv", ".json", ".xml", ".epub",
}

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

@app.post("/convert")
async def convert_to_markdown(file: UploadFile = File(...)):
    filename = Path(file.filename or "upload").name
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {extension}",
        )

    contents = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the 20 MB limit",
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=extension,
            delete=False,
        ) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        result = markdown_converter.convert(temp_path)
        markdown = result.markdown

        if not markdown or not markdown.strip():
            raise HTTPException(
                status_code=422,
                detail="No readable content found in the document",
            )

        return {
            "fileName": filename,
            "mimeType": file.content_type,
            "markdown": markdown,
        }

    except HTTPException:
        raise
    except Exception as exc:
        # Log the detailed exception server-side in production.
        raise HTTPException(
            status_code=422,
            detail="Could not convert this document",
        ) from exc
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        await file.close()