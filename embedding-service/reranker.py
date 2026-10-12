from sentence_transformers import CrossEncoder


MODEL_ID = "cross-encoder/ms-marco-MiniLM-L12-v2"


class Reranker:

    def __init__(self):
        self.model = CrossEncoder(MODEL_ID)

    def rerank(self, query: str, documents: list[str]):
        pairs = [
            (query, document)
            for document in documents
        ]

        scores = self.model.predict(pairs)

        results = [
            {
                "index": i,
                "score": float(score)
            }
            for i, score in enumerate(scores)
        ]

        results.sort(
            key=lambda x: x["score"],
            reverse=True
        )

        return results