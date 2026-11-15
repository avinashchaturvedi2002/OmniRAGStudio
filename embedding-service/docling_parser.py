
from functools import lru_cache
from pathlib import Path

from docling.document_converter import DocumentConverter


@lru_cache(maxsize=1)
def get_converter() -> DocumentConverter:
    """Reuse the converter and its initialized models."""
    return DocumentConverter()


def parse_with_docling(file_path: str) -> str:
    """Convert a supported document into structured Markdown."""
    path = Path(file_path)

    result = get_converter().convert(str(path))
    markdown = result.document.export_to_markdown()

    if not markdown.strip():
        raise ValueError(
            f"Docling extracted no content from {path.name}"
        )

    return markdown
