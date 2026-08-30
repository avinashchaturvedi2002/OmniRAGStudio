from model import NanoEm1Model


# --------------------------------------------------
# 1. Load model
# --------------------------------------------------

model = NanoEm1Model()


# --------------------------------------------------
# 2. Test data
# --------------------------------------------------

query = "How does virtual memory work?"

documents = [
    "Virtual memory allows a system to use disk space as an extension of physical memory.",
    "A process is a program in execution.",
    "Paging divides physical memory into fixed-size blocks called frames.",
    "A file system organizes and stores files on storage devices.",
]


# --------------------------------------------------
# 3. Generate embeddings
# --------------------------------------------------

print("\nGenerating embeddings...")

query_embedding = model.embed_query(query)

document_embeddings = model.embed_documents(documents)


# --------------------------------------------------
# 4. Check dimensions
# --------------------------------------------------

print("\nQuery embedding shape:", query_embedding.shape)
print("Document embeddings shape:", document_embeddings.shape)


# --------------------------------------------------
# 5. Calculate similarities
# --------------------------------------------------

similarities = query_embedding @ document_embeddings.T


# --------------------------------------------------
# 6. Display results
# --------------------------------------------------

print("\nSimilarity scores:")

for i, score in enumerate(similarities):
    print(f"\nDocument {i + 1}")
    print(f"Score: {score.item():.4f}")
    print(f"Text: {documents[i]}")


# --------------------------------------------------
# 7. Find best document
# --------------------------------------------------

best_index = similarities.argmax().item()

print("\n" + "=" * 60)
print("MOST RELEVANT DOCUMENT")
print("=" * 60)

print(f"Score: {similarities[best_index].item():.4f}")
print(f"Text: {documents[best_index]}")
