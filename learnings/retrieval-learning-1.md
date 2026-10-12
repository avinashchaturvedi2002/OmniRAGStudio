# RAG Retrieval Baseline — Findings & Analysis

## 1. Experiment Overview

We evaluated the current retrieval pipeline without changing the retrieval algorithm.

### Current pipeline

```text
Query
  ↓
Nano-Em1 embedding
  ↓
MongoDB Vector Search
  ↓
Top-5 chunks
  ↓
Evaluation
```

The current baseline therefore represents:

> **Nano-Em1 + heading breadcrumbs + MongoDB Vector Search + top-5 retrieval**

The purpose of this experiment was to understand the strengths and weaknesses of the current retriever before introducing more advanced retrieval techniques.

---

# 2. Metrics Used

We evaluated retrieval using:

### Recall@5

Measures whether the relevant chunks were found within the top 5 results.

```text
Recall@5 =
number of relevant chunks retrieved
------------------------------------
total number of relevant chunks
```

High Recall means the retriever is good at **finding the answer somewhere in the retrieved results**.

---

### Precision@5

Measures how many of the top-5 retrieved chunks are actually relevant.

```text
Precision@5 =
relevant chunks in top 5
------------------------
5
```

High Precision means the retriever is good at **avoiding unnecessary context**.

---

### Reciprocal Rank

Measures how high the first relevant result appears.

```text
Rank 1 → 1.00
Rank 2 → 0.50
Rank 3 → 0.33
Rank 4 → 0.25
Rank 5 → 0.20
No relevant result → 0
```

---

### MRR (Mean Reciprocal Rank)

The average reciprocal rank across all queries.

Our current experiment produced:

```text
MRR = 0.8167
```

---

# 3. Overall Results

The evaluator processed 30 queries.

```text
Queries evaluated: 30
Average Recall@5: NaN%
Average Precision@5: 28.0%
MRR: 0.8167
```

The Recall value became `NaN` because some evaluation queries intentionally had no relevant chunks:

```text
relevantChunkIndices: []
```

The recall formula attempted to divide by zero for those queries.

Therefore, the `NaN` is an **evaluation implementation issue**, not evidence that retrieval failed.

The unanswerable queries should eventually be evaluated using a separate abstention / false-positive metric.

---

# 4. Finding #1 — Retrieval Is Good at Finding Relevant Information

The strongest result from the experiment is that the retriever usually finds the correct chunks.

For example:

```text
Query:
How does virtual memory work?

Rank 1 | Chunk 4 | Score 0.8048 | RELEVANT
Rank 2 | Chunk 5 | Score 0.7459 | RELEVANT
Rank 3 | Chunk 3 | Score 0.7423 | RELEVANT
Rank 4 | Chunk 7 | Score 0.7031 | IRRELEVANT
Rank 5 | Chunk 6 | Score 0.6688 | IRRELEVANT
```

All three relevant chunks were retrieved, and all three appeared before the irrelevant chunks.

This indicates that the current embedding + vector-search pipeline is successfully capturing semantic relationships.

Another example:

```text
Query:
What does a file system do?

Rank 1 | Chunk 6 | Score 0.8003 | RELEVANT
Rank 2 | Chunk 7 | Score 0.7653 | RELEVANT
Rank 3 | Chunk 0 | Score 0.6967 | IRRELEVANT
Rank 4 | Chunk 3 | Score 0.6858 | IRRELEVANT
Rank 5 | Chunk 1 | Score 0.6815 | IRRELEVANT
```

Again, the relevant chunks are ranked first.

### Conclusion

The current system does **not** have a fundamental "can't find the answer" problem.

It is generally capable of retrieving the correct information.

---

# 5. Finding #2 — Ranking Is Generally Good

The MRR of:

```text
0.8167
```

shows that the first relevant result is usually ranked very highly.

Most queries had:

```text
Reciprocal Rank = 1.0000
```

meaning the first result was relevant.

There were some cases where an irrelevant chunk appeared before the relevant one.

For example:

```text
Query:
How are processes managed by an operating system?

Rank 1 | Chunk 3 | Score 0.7797 | IRRELEVANT
Rank 2 | Chunk 1 | Score 0.7663 | RELEVANT
Rank 3 | Chunk 0 | Score 0.7509 | IRRELEVANT
Rank 4 | Chunk 2 | Score 0.7309 | RELEVANT
```

The relevant information was still retrieved, but the first relevant result appeared at rank 2.

Therefore:

```text
Reciprocal Rank = 1/2 = 0.5
```

### Conclusion

The retriever generally ranks useful information near the top, but closely related concepts can occasionally outrank the actual answer.

---

# 6. Finding #3 — Precision Is the Main Weakness

The overall Precision@5 was:

```text
28.0%
```

This is much weaker than the retrieval recall/ranking performance.

For example:

```text
Query:
What is virtual memory?

Rank 1 | Chunk 4 | Score 0.7954 | RELEVANT
Rank 2 | Chunk 5 | Score 0.7269 | IRRELEVANT
Rank 3 | Chunk 3 | Score 0.7227 | IRRELEVANT
Rank 4 | Chunk 7 | Score 0.6775 | IRRELEVANT
Rank 5 | Chunk 1 | Score 0.6544 | IRRELEVANT
```

The correct answer is ranked #1, but the other four results are not considered relevant according to the evaluation ground truth.

Therefore:

```text
Precision@5 = 1/5 = 20%
```

This pattern occurs frequently.

### Important interpretation

The retriever is often **finding the answer**, but it is also returning additional chunks that are merely semantically related.

This means the major problem is not:

> "Can we find the answer?"

It is:

> "Can we determine which retrieved chunks are actually relevant enough to pass to the LLM?"

---

# 7. Finding #4 — Top-K Retrieval Forces Unnecessary Results

The current retrieval strategy is:

```text
Give me the top 5 most similar chunks.
```

This guarantees that five chunks are returned even if only one or two are useful.

For example:

```text
What is virtual memory?

0.7954  Virtual Memory       ✓
0.7269  Paging               ✗
0.7227  Memory Management    ✗
0.6775  File Allocation      ✗
0.6544  Processes            ✗
```

The vector search is doing what it was asked to do: returning the five closest vectors.

However, a RAG system ideally wants something closer to:

```text
Return the chunks that are sufficiently relevant
to answer the query.
```

These are two different objectives.

### Current behavior

```text
Top-K retrieval
      ↓
Always return K results
```

### Desired behavior

```text
Candidate retrieval
      ↓
Relevance decision
      ↓
Return only sufficiently relevant chunks
```

This is the main direction suggested by the baseline results.

---

# 8. Finding #5 — Vector Similarity Score Is Not a Relevance Score

The experiment shows that the MongoDB vector-search score cannot simply be interpreted as:

```text
0.8 = relevant
0.7 = maybe
0.6 = irrelevant
```

The aggregate score analysis was:

```text
Relevant chunks:
Count: 42
Average: 0.7678
Minimum: 0.6713
Maximum: 0.8213

Irrelevant chunks:
Count: 108
Average: 0.7035
Minimum: 0.5855
Maximum: 0.7823
```

The important observation is that the distributions overlap.

For example:

```text
Relevant minimum = 0.6713
Irrelevant maximum = 0.7823
```

Therefore, an absolute threshold cannot perfectly separate relevant and irrelevant chunks.

There are irrelevant chunks with scores higher than some relevant chunks.

### Conclusion

The vector score is a **similarity signal**, not a guaranteed relevance classifier.

---

# 9. Finding #6 — There Is Still Some Score Separation

Although the score distributions overlap, their averages are different:

```text
Relevant average:
0.7678

Irrelevant average:
0.7035
```

Difference:

```text
0.7678 - 0.7035 = 0.0643
```

Therefore, the score still contains useful information.

It is just not perfectly separable.

This suggests that score-based filtering may improve retrieval, but the threshold must be experimentally determined rather than arbitrarily chosen.

---

# 10. Finding #7 — Score Separation Depends on the Query

Some queries have a very clear score boundary.

Example:

```text
How does the OS manage memory?

0.8213 ✓
0.7877 ✓
0.7678 ✓
----------------
0.7524 ✗
0.7294 ✗
```

This is a relatively clean separation.

However, other queries show significant overlap.

Example:

```text
How does the OS manage processes?

0.7642 ✗
0.7631 ✓
0.7310 ✓
0.7261 ✗
0.7233 ✗
```

Here, an irrelevant chunk has a higher score than the first relevant chunk.

### Conclusion

A single global threshold may help, but it is unlikely to perfectly solve relevance filtering.

We need to test this empirically.

---

# 11. Finding #8 — The System Understands Related Concepts

The "page table" query is particularly informative.

The document does not contain information about page tables.

Ground truth:

```text
Expected: NONE
```

Yet the retriever returned:

```text
Rank 1 | Chunk 5 | Score 0.7177 | IRRELEVANT
Rank 2 | Chunk 7 | Score 0.6849 | IRRELEVANT
Rank 3 | Chunk 4 | Score 0.6647 | IRRELEVANT
...
```

This is not necessarily a failure of the embedding model.

"Page table" is semantically related to concepts such as:

```text
paging
pages
memory
```

Therefore, the embedding model reasonably retrieves the closest related material.

However:

```text
semantic similarity
        ≠
ability to answer the question
```

This demonstrates why RAG needs a relevance/answerability layer in addition to vector similarity.

---

# 12. Finding #9 — Out-of-Domain Queries Produce Lower Scores

For:

```text
How do I bake a chocolate cake?
```

the scores were:

```text
0.6111
0.5978
0.5962
0.5914
0.5855
```

All retrieved chunks were irrelevant.

This is significantly lower than many of the scores for actual OS questions.

This is promising because it suggests the vector score may be useful for detecting completely unrelated queries.

However, the "page table" example shows that **closely related but unanswered questions are harder to detect**.

Therefore, we have at least two types of unanswerable queries:

```text
Type 1:
Completely unrelated

"How do I bake a chocolate cake?"

→ low scores
```

and:

```text
Type 2:
Related but not actually answered

"What is a page table?"

→ moderately high scores
```

The second case is the harder RAG problem.

---

# 13. Finding #10 — Ground Truth Quality Is Critical

The evaluation itself needs careful labeling.

A query should only mark a chunk as relevant if that chunk can actually contribute to answering the question.

For example:

```text
"What is a page table?"
```

should be:

```ts
relevantChunkIndices: []
```

because the document does not explain page tables.

Similarly, questions such as:

```text
"What information does the operating system maintain about a process?"
```

should be treated as unanswerable because the provided chunks do not contain that information.

Ground truth should distinguish between:

### Directly answerable

```text
"What is virtual memory?"
→ [4]
```

### Requires multiple chunks

```text
"What is the relationship between paging and virtual memory?"
→ [4, 5]
```

### Related but not answerable

```text
"What is a page table?"
→ []
```

### Completely out of domain

```text
"How do I bake a chocolate cake?"
→ []
```

This distinction is important for evaluating the eventual relevance filter.

---

# 14. Important Metric Issue — Unanswerable Queries

Queries with:

```ts
relevantChunkIndices: []
```

cause ordinary recall to become:

```text
0 / 0
```

which results in:

```text
NaN
```

These queries should not be treated as ordinary recall queries.

Instead, they should eventually be evaluated with a separate metric measuring whether the system correctly abstains from returning relevant-looking context.

Possible future metrics:

```text
Abstention accuracy
False-positive rate
No-answer detection accuracy
```

For now, the important point is:

> `NaN` is an evaluation problem, not evidence of poor retrieval.

---

# 15. Overall Interpretation

The current system can be summarized as:

```text
                    CURRENT RETRIEVER

                 Finding the answer
                        ★★★★★

                 Ranking the answer
                        ★★★★☆

                 Avoiding extra chunks
                        ★★☆☆☆

                 Detecting unrelated queries
                        ★★★★☆

                 Detecting related-but-
                 unanswerable queries
                        ★★☆☆☆
```

The system is therefore **not suffering from a basic retrieval problem**.

Its main weakness is **relevance precision**.

---

# 16. What We Should NOT Do Yet

Based on these findings, we should not immediately introduce:

* HyDE
* Query expansion
* Hybrid search
* Reranking
* Hierarchical retrieval
* Late chunking
* A different embedding model

The current retriever is already capable of finding the correct information.

Introducing many advanced techniques now would make it difficult to determine which change actually improved the system.

---

# 17. Current Baseline

We should record the current system as our baseline:

```text
Embedding model:
Nano-Em1

Embedding dimension:
1024

Embedding text:
heading breadcrumbs + chunk content

Vector database:
MongoDB Atlas Vector Search

Similarity:
Cosine

Retrieval:
Top-5

Evaluation:
30 queries

Precision@5:
28.0%

MRR:
0.8167

Recall@5:
Currently invalid because unanswerable queries
produce NaN and need separate handling.
```

---

# 18. Main Lesson

The most important lesson from this experiment is:

> **Vector retrieval is good at finding semantically similar information, but semantic similarity alone does not determine whether a chunk is actually useful for answering the query.**

Our baseline shows:

```text
Finding relevant information
            ↓
        works well

Filtering irrelevant information
            ↓
        needs improvement

Detecting "I don't know"
            ↓
        needs improvement
```

Therefore, the next retrieval improvement should focus on **relevance filtering**, not replacing the entire retrieval system.

---

# 19. Next Experiment

Before changing the retrieval architecture, we should run a controlled experiment.

### Current baseline

```text
Query
 ↓
Vector Search
 ↓
Top 5
```

### Proposed experiment

```text
Query
 ↓
Vector Search
 ↓
Top 10–20 candidates
 ↓
Score-based relevance filtering
 ↓
Final chunks
```

We should test multiple thresholds rather than choosing one arbitrarily.

For example:

```text
0.60
0.65
0.70
0.75
0.80
```

For every threshold, measure:

```text
Recall
Precision
MRR
Average number of chunks returned
False positives on unanswerable queries
```

Then compare the results against the baseline.

The goal is to determine:

> **Can a simple relevance filter substantially improve precision while preserving the high recall of our current retriever?**

Only after answering that question should we decide whether we need more sophisticated techniques such as reranking, hybrid retrieval, query expansion, or hierarchical retrieval.
