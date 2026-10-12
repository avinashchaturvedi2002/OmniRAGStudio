from colbert.infra import ColBERTConfig
from colbert.modeling.checkpoint import Checkpoint


MODEL_NAME = "colbert-ir/colbertv2.0"


query = "How does virtual memory work?"

documents = [
    "Virtual memory allows a system to use disk space as an extension of physical memory.",
    "A process is a program in execution.",
    "A file system organizes and stores files on storage devices.",
]


config = ColBERTConfig(
    doc_maxlen=180,
    nbits=2,
)


print("Loading ColBERT...")

checkpoint = Checkpoint(
    MODEL_NAME,
    colbert_config=config,
)

print("ColBERT loaded successfully")


print("Encoding query...")

Q = checkpoint.queryFromText([query])

print("Query embedding shape:")
print(Q.shape)


print("Encoding documents...")

D = checkpoint.docFromText(documents)

print("Number of document embeddings:")
print(len(D))


print("\nFirst query embedding:")
print(Q)


print("\nFirst document embedding:")
print(D[0])