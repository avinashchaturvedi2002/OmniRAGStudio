# Relevance Filter — Approaches Tried & Next Plan

## Goal

The goal of the relevance-filter stage is to decide **how many chunks should be passed to the LLM** after retrieval and reranking.

The desired behavior is dynamic:

```text
Reranked candidates
        ↓
Relevance Filter
        ↓
0, 1, 2, ... N relevant chunks
        ↓
LLM
```

We do **not** want to blindly send a fixed number such as Top-5.

The current pipeline is:

```text
User Query
    ↓
Nano-Em1 Embedding
    ↓
Vector Search (Top-20 candidates)
    ↓
Cross-Encoder Reranker
    ↓
Relevance Filter        ← current focus
    ↓
Context Builder
    ↓
LLM
```

---

# 1. Fixed Top-K Retrieval

## Approach

Initially, retrieve a fixed number of chunks and pass the top K results forward.

For evaluation:

- Vector retrieval candidate pool: Top-20
- Final evaluation: Top-5

The idea was essentially:

```text
Vector Search
     ↓
Top-20
     ↓
Reranker
     ↓
Top-5
     ↓
LLM
```

## Result

The baseline evaluation showed:

- Average Precision@5: **28.0%**
- MRR: **0.8167**
- Recall@5 could not be calculated correctly for NONE queries using the original metric setup.

The main issue was not that relevant chunks could not be retrieved. The main issue was that Top-5 frequently contained unnecessary chunks.

## Conclusion

Fixed Top-K is simple but does not solve the actual problem.

We need:

```text
0 → N chunks
```

instead of:

```text
always 5 chunks
```

---

# 2. Cross-Encoder Reranking

## Approach

We introduced a local Cross-Encoder:

```text
cross-encoder/ms-marco-MiniLM-L12-v2
```

The vector search retrieves a larger candidate pool, and the Cross-Encoder reranks the candidates based on the query-document pair.

Pipeline:

```text
Query
  ↓
Vector Search Top-20
  ↓
Cross-Encoder
  ↓
Ranked candidates
```

The Cross-Encoder produces raw ranking scores such as:

```text
9.11
4.93
-5.48
-6.29
...
```

These scores are ranking scores, not probabilities.

## Reranker Evaluation

The reranker was evaluated independently on the current evaluation dataset.

Results:

- Top-1 relevant: **84.62%**
- Recall@5: **100.00%**
- Precision@5: **32.31%**
- MRR: **0.9167**

## Interpretation

This is a strong indication that the reranker is doing its primary job reasonably well:

> Relevant chunks are generally being moved toward the top.

However, Precision@5 is still low.

For example:

```text
"What is virtual memory?"

1. chunk 4   ✓   8.8046
2. chunk 5   ✗  -6.6556
3. chunk 3   ✗  -6.7597
4. chunk 6   ✗ -10.6248
5. chunk 1   ✗ -10.8280
```

Only one of the five returned chunks is relevant.

## Conclusion

The reranker should remain in the pipeline.

The problem has moved from:

> "Can we rank useful chunks highly?"

to:

> "Where should we stop and which chunks should we actually keep?"

---

# 3. Largest Score-Gap / Elbow Approach

## Approach

After reranking, calculate the consecutive score differences:

```text
score[0] - score[1]
score[1] - score[2]
score[2] - score[3]
...
```

Then find the largest gap.

The assumption was:

> A large gap might indicate the boundary between relevant and irrelevant chunks.

Example:

```text
9.11 ✓
4.93 ✓
──────────── 10.42 gap
-5.48 ✗
-6.29 ✗
```

In this case, the largest gap correctly identifies the boundary after rank 2.

## Evaluation Result

Across 26 answerable queries:

- Average true boundary gap: **7.3846**
- Average largest gap: **9.7060**
- Boundary was the largest gap in: **14 / 26**
- Boundary detection rate: **53.8%**

## Why It Failed

The largest gap is not necessarily the boundary between relevant and irrelevant chunks.

Example:

```text
"How does virtual memory work?"

rank 1  ✓  7.9724
              ↓ 11.9384  ← largest gap
rank 2  ✓ -3.9661
rank 3  ✓ -4.9446
              ↓ 5.8816   ← actual boundary
rank 4  ✗ -10.8263
```

If we used the largest gap, we would keep only chunk 4 and incorrectly discard two relevant chunks.

Another example:

```text
"Why does an operating system use paging?"

rank 1 ✓  1.0218
rank 2 ✗ -4.5528
rank 3 ✓ -9.1877
```

Here relevant chunks are not even grouped into one continuous score cluster.

## Conclusion

Largest-gap detection is **not reliable enough to be our relevance filter**.

We should not implement it as the primary production strategy.

---

# 4. Global Reranker-Score Threshold

## Approach

The next experiment tested whether a fixed Cross-Encoder score threshold could determine relevance.

The rule was:

```text
keep chunk if rerankScore >= threshold
```

Thresholds tested:

```text
8
6
4
2
0
-2
-4
-6
-8
-10
```

We measured:

- Recall
- Precision
- Average chunks kept
- NONE-query rejection rate

## Results

| Threshold | Recall | Precision | Avg Chunks | NONE Rejection |
|---:|---:|---:|---:|---:|
| 8 | 11.90% | 100.00% | 0.19 | 100.00% |
| 6 | 30.95% | 100.00% | 0.50 | 100.00% |
| 4 | 40.48% | 94.44% | 0.69 | 100.00% |
| 2 | 50.00% | 91.30% | 0.88 | 100.00% |
| 0 | 57.14% | 85.71% | 1.08 | 75.00% |
| -2 | 64.29% | 79.41% | 1.31 | 75.00% |
| -4 | 73.81% | 70.45% | 1.69 | 50.00% |
| -6 | 85.71% | 65.45% | 2.12 | 50.00% |
| -8 | 95.24% | 54.79% | 2.81 | 25.00% |
| -10 | 97.62% | 36.28% | 4.35 | 25.00% |

## Interpretation

There is a clear trade-off.

Higher threshold:

```text
↑ Precision
↑ NONE rejection
↓ Recall
```

Lower threshold:

```text
↑ Recall
↓ Precision
↓ NONE rejection
↑ Number of chunks
```

No single threshold gives all of the properties we want.

For example:

### Threshold = -6

```text
Recall:          85.71%
Precision:       65.45%
Average chunks:   2.12
NONE rejection:  50%
```

### Threshold = -8

```text
Recall:          95.24%
Precision:       54.79%
Average chunks:   2.81
NONE rejection:  25%
```

## Conclusion

A single global score threshold is **not sufficient** for our final relevance filter.

The Cross-Encoder score depends heavily on the query and candidate set, so the same absolute score does not always represent the same level of usefulness.

---

# 5. Current Understanding

After these experiments, we have separated the problem into two different questions.

## Question A — Does the corpus contain evidence that can answer the query?

This is the **answerability / abstention** problem.

```text
Query
  ↓
Does useful evidence exist?
  ↓
NO → []
YES
```

## Question B — If evidence exists, which chunks should be passed to the LLM?

This is the **dynamic chunk selection** problem.

```text
Reranked candidates
        ↓
Select relevant chunks
        ↓
0 → N
```

These should not be treated as the same problem.

A reranker can tell us:

> "Chunk A is more relevant than Chunk B."

That does not necessarily mean:

> "Chunk A contains enough evidence to answer the query."

---

# 6. Approaches We Have Ruled Out

| Approach | Decision | Reason |
|---|---|---|
| Fixed Top-K | ❌ | Sends unnecessary chunks and cannot return dynamic 0-N |
| Largest score gap | ❌ | Only detected the true boundary 53.8% of the time |
| Single global score threshold | ❌ | Strong recall/precision trade-off and poor NONE-query rejection |
| Cross-Encoder reranking | ✅ Keep | 84.62% Top-1 relevant, 100% Recall@5, MRR 0.9167 |

---

# 7. Planned Next Step

Before implementing the production `RelevanceFilter`, we will investigate **answerability** separately.

Create:

```text
src/evaluation/answerabilityEvaluator.ts
```

The evaluator should compare answerable and unanswerable queries using signals from the reranked score distribution.

For each query, we want to inspect:

```text
Best rerank score
Second-best score
Top-score gap
Score distribution
Best relevant score
Best irrelevant score
```

The goal is to determine whether the reranker itself provides enough information to distinguish:

```text
Answer exists in corpus
            vs
Answer does not exist in corpus
```

without introducing an LLM-based relevance judge.

---

# 8. Planned Final Architecture

The current target architecture is:

```text
                         User Query
                             │
                             ▼
                    Nano-Em1 Embedding
                             │
                             ▼
                    Vector Search Top-20
                             │
                             ▼
                    Cross-Encoder Reranker
                             │
                             ▼
                 ┌─────────────────────────┐
                 │     Relevance Layer     │
                 │                         │
                 │  1. Answerability       │
                 │  2. Dynamic chunk       │
                 │     selection           │
                 └────────────┬────────────┘
                              │
                           0 → N
                              │
                              ▼
                       Context Builder
                              │
                              ▼
                             LLM
```

The final implementation should expose a simple interface such as:

```ts
interface RelevanceFilter {
    filter(
        query: string,
        results: SearchResult[]
    ): SearchResult[];
}
```

The exact filtering algorithm has **not been decided yet**. We will choose it based on the evaluation results rather than hard-coding a threshold or K.

---

# Current Status

### Completed

- Vector retrieval
- Local embeddings
- MongoDB Atlas Vector Search
- Cross-Encoder reranking
- Reranker evaluation
- Score-gap experiment
- Threshold experiment

### Current focus

**Determine a reliable relevance/answerability strategy.**

### Not doing yet

- HyDE
- Additional contextual embedding models
- LLM relevance judge
- Production context builder
- Final relevance filter implementation

The goal is to finish the relevance layer first before adding more retrieval techniques.
