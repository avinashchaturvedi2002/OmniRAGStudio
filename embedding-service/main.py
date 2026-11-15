import os
import tempfile
import logging
from pathlib import Path
from markitdown import MarkItDown
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from pydantic import BaseModel
from sentence_transformers import CrossEncoder
from model import NanoEm1Model
from starlette.concurrency import run_in_threadpool
from docling_parser import parse_with_docling
from conversion_pipeline import convert_and_validate_file, convert_scanned_notice_to_markdown


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
    ".pdf",
    ".jpeg",
    ".jpg",
    ".png",
    ".tiff",
    ".bmp",
    ".docx",
    ".pptx",
    ".xlsx",
    ".html",
    ".txt",
    ".md",
    ".csv",
}


MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

@app.post("/convert")
async def convert_to_markdown(
    file: UploadFile = File(...),
    strategy: str = Form("auto"),
    provider: str = Form("auto"),
    prompt: str = Form(None),
):
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

        # For scanned PDFs, images, or when requested, use the enhanced notice conversion pipeline
        if strategy in {"vision_llm", "auto", "docling"} or extension in {".pdf", ".png", ".jpg", ".jpeg"}:
            res = await run_in_threadpool(
                convert_scanned_notice_to_markdown,
                temp_path,
                filename,
                extension,
                strategy,
                provider,
                prompt,
            )
            return {
                "fileName": filename,
                "mimeType": file.content_type,
                "markdown": res["markdown"],
                "strategy": res.get("strategyUsed", strategy),
                "pageCount": res.get("pageCount", 1),
                "warnings": res.get("warnings", []),
            }

        # Fallback to standard MarkItDown for digital office docs
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
            "strategy": "markitdown",
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Conversion failed for %s: %s", filename, exc)
        raise HTTPException(
            status_code=422,
            detail=f"Could not convert document: {str(exc)}",
        ) from exc
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        await file.close()


@app.post("/parse")
async def parse_document(file: UploadFile = File(...)):
    filename = Path(file.filename or "upload.bin").name
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {extension}",
        )

    contents = await file.read(MAX_FILE_SIZE + 1)

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the 20 MB limit",
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty",
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=extension, delete=False
        ) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        markdown = await run_in_threadpool(
            parse_with_docling, temp_path
        )

        return {
            "fileName": filename,
            "mimeType": file.content_type,
            "parser": "docling",
            "markdown": markdown,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Document parsing failed: {str(exc)}",
        ) from exc

    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)

logger=logging.getLogger(__name__)


CONVERT_VALIDATE_MAX_BYTES = 20 * 1024 * 1024

CONVERT_VALIDATE_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".docx",
    ".pptx",
    ".xlsx",
    ".html",
    ".htm",
    ".txt",
    ".md",
    ".csv",
}


@app.post("/convert-and-validate")
async def convert_and_validate_endpoint(
    file: UploadFile = File(...),
):
    filename = Path(
        file.filename or "upload.bin"
    ).name
    extension = Path(filename).suffix.lower()

    if extension not in CONVERT_VALIDATE_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {extension}",
        )

    contents = await file.read(
        CONVERT_VALIDATE_MAX_BYTES + 1
    )

    if len(contents) > CONVERT_VALIDATE_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the 20 MB limit",
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty",
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=extension,
            delete=False,
        ) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        result = await run_in_threadpool(
            convert_and_validate_file,
            temp_path,
            filename,
            extension,
        )

        result["mimeType"] = file.content_type
        return result

    except Exception as exc:
        logger.exception(
            "Conversion and validation failed for %s",
            filename,
        )
        raise HTTPException(
            status_code=502,
            detail="Document conversion or validation failed. "
                   "Check the embedding-service logs.",
        ) from exc

    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)
