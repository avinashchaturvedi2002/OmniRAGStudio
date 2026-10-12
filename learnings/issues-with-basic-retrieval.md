Low Precision: Top-5 retrieval returns several semantically related but irrelevant chunks, giving only 28% Precision@5.
Fixed Top-K: The system always returns 5 chunks, even when only 1–2 are actually needed.
No Relevance Filtering: There is currently no mechanism to decide whether a retrieved chunk is relevant enough to pass forward.
Score Overlap: Relevant and irrelevant chunks have overlapping similarity scores, so score alone isn't a perfect relevance signal.
Related-but-Unanswerable Queries: Queries like “What is a page table?” retrieve related paging content even though the document cannot answer the question.
Occasional Ranking Errors: Closely related concepts can outrank the correct chunk, lowering MRR for some queries.
No Abstention: The retriever currently returns results even when the knowledge base contains no answer.
Weak Out-of-Domain Handling: Completely unrelated queries get lower scores, but there is no explicit mechanism to reject them.
Ground-Truth Sensitivity: Evaluation results depend heavily on correctly labeling which chunks genuinely answer each query.
No Query-Specific Relevance Decision: The same fixed Top-K strategy is used regardless of how strongly or weakly the query matches the documents.