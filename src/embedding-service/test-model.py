import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer


MODEL_ID = "KiteFishAI/Nano-Em1-0.6B-v2.1"


# --------------------------------------------------
# 1. Load tokenizer and model
# --------------------------------------------------

print("Loading model...")

tokenizer = AutoTokenizer.from_pretrained(
    MODEL_ID,
    trust_remote_code=True,
)

model = AutoModel.from_pretrained(
    MODEL_ID,
    trust_remote_code=True,
).eval()

print("Model loaded.")


# --------------------------------------------------
# 2. Embedding function
# --------------------------------------------------

def embed(texts: list[str]) -> torch.Tensor:

    inputs = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=512,
        return_tensors="pt",
    )

    with torch.no_grad():
        output = model(**inputs).last_hidden_state

    # attention_mask:
    #
    # 1 = real token
    # 0 = padding
    #
    # Shape:
    # [batch_size, sequence_length]
    #
    # We add a dimension so that it becomes:
    # [batch_size, sequence_length, 1]

    mask = inputs["attention_mask"].unsqueeze(-1).float()

    # Mean pooling
    #
    # Sum token embeddings while ignoring padding tokens.
    pooled = (output * mask).sum(1)

    # Number of real tokens
    token_count = mask.sum(1)

    # Average the token embeddings
    pooled = pooled / token_count.clamp(min=1e-9)

    # Normalize each embedding to unit length
    return F.normalize(pooled, dim=-1)


# --------------------------------------------------
# 3. Prepare query
# --------------------------------------------------

query_instruction = (
    "Instruct: Given a query, retrieve documents that answer the query\n"
    "Query: "
)

query = query_instruction + "How does virtual memory work?"


# --------------------------------------------------
# 4. Prepare documents
# --------------------------------------------------

documents = [
    "Virtual memory allows a system to use disk space as an extension of physical memory.",
    "A process is a program in execution.",
    "Paging divides physical memory into fixed-size blocks called frames.",
    "A file system organizes and stores files on storage devices.",
]


# --------------------------------------------------
# 5. Generate embeddings
# --------------------------------------------------

print("Generating embeddings...")

query_embedding = embed([query])

document_embeddings = embed(documents)


# --------------------------------------------------
# 6. Check dimensions
# --------------------------------------------------

print()
print("Query embedding shape:", query_embedding.shape)
print("Document embeddings shape:", document_embeddings.shape)


# --------------------------------------------------
# 7. Calculate similarities
# --------------------------------------------------

# Both query and document embeddings are normalized.
#
# Therefore:
#
# dot product = cosine similarity

similarities = query_embedding @ document_embeddings.T


# --------------------------------------------------
# 8. Display results
# --------------------------------------------------

print("\nSimilarity scores:")

for i, score in enumerate(similarities[0]):
    print(f"\nDocument {i + 1}")
    print(f"Score: {score.item():.4f}")
    print(f"Text: {documents[i]}")


# --------------------------------------------------
# 9. Find best document
# --------------------------------------------------

best_index = similarities[0].argmax().item()

print("\n" + "=" * 60)
print("MOST RELEVANT DOCUMENT")
print("=" * 60)

print(f"Score: {similarities[0][best_index].item():.4f}")
print(f"Text: {documents[best_index]}")

