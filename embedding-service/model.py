import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer


MODEL_ID = "KiteFishAI/Nano-Em1-0.6B-v2.1"

QUERY_INSTRUCTION = (
    "Instruct: Given a query, retrieve documents that answer the query\n"
    "Query: "
)


class NanoEm1Model:

    def __init__(self):
        print("Loading Nano-Em1 model...")

        self.tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
        )

        self.model = AutoModel.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
        ).eval()

        print("Nano-Em1 model loaded.")

    def embed(self, texts: list[str]) -> torch.Tensor:
        """
        Convert a list of texts into normalized embeddings.

        Documents/passages should be passed directly.
        Queries should already contain the query instruction.
        """

        inputs = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )

        with torch.no_grad():
            output = self.model(**inputs).last_hidden_state

        # Ignore padding tokens when calculating the mean.
        mask = inputs["attention_mask"].unsqueeze(-1).float()

        # Mean pooling over token embeddings.
        pooled = (output * mask).sum(1)

        token_count = mask.sum(1)

        pooled = pooled / token_count.clamp(min=1e-9)

        # Normalize embeddings to unit length.
        return F.normalize(pooled, dim=-1)

    def embed_documents(
        self,
        texts: list[str],
    ) -> torch.Tensor:
        """
        Embed documents/passages.

        Documents are encoded without a retrieval instruction.
        """

        return self.embed(texts)

    def embed_query(
        self,
        text: str,
    ) -> torch.Tensor:
        """
        Embed a single retrieval query.

        Nano-Em1 expects the retrieval instruction
        to be prepended to the query.
        """

        query = QUERY_INSTRUCTION + text

        return self.embed([query])[0]

