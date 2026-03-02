import chromadb
import os

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")


class RAGStore:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=CHROMA_DIR)
        self.collection = self.client.get_or_create_collection(
            name="finance_memory",
            metadata={"hnsw:space": "cosine"},
        )

    def add_transaction_memory(self, transaction: dict):
        doc = (
            f"{transaction['owner']} spent ${transaction['amount']:.2f} on "
            f"{transaction['description']} ({transaction.get('category', 'uncategorized')}) "
            f"on {transaction.get('date', 'unknown date')}. "
            f"Tags: {', '.join(transaction.get('tags', []))}."
        )
        self.collection.upsert(
            documents=[doc],
            metadatas=[{
                "type": "transaction",
                "category": transaction.get("category", ""),
                "owner": transaction["owner"],
                "amount": str(transaction["amount"]),
            }],
            ids=[f"txn_{transaction['id']}"],
        )

    def add_goal_memory(self, goal: dict, outcome: str = ""):
        doc = (
            f"Goal: {goal['name']}. Target: ${goal['target_amount']:.2f}, "
            f"Current: ${goal.get('current_amount', 0):.2f}. "
            f"Priority: {goal.get('priority', 'medium')}. "
            f"Deadline: {goal.get('deadline', 'none')}. "
            f"Outcome: {outcome or goal.get('status', 'active')}."
        )
        self.collection.upsert(
            documents=[doc],
            metadatas=[{
                "type": "goal",
                "goal_name": goal["name"],
                "status": goal.get("status", "active"),
            }],
            ids=[f"goal_{goal['id']}"],
        )

    def add_recommendation_memory(self, rec: dict):
        doc = (
            f"Recommendation ({rec['type']}): {rec['title']}. "
            f"{rec['description']} Reasoning: {rec['reasoning']} "
            f"Status: {rec.get('status', 'pending')}."
        )
        self.collection.upsert(
            documents=[doc],
            metadatas=[{"type": "recommendation", "rec_type": rec["type"]}],
            ids=[f"rec_{rec['id']}"],
        )

    def search_similar(self, query: str, n_results: int = 5, filter_type: str | None = None) -> list[dict]:
        where = {"type": filter_type} if filter_type else None
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where,
        )
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        ids = results.get("ids", [[]])[0]
        return [{"id": i, "document": d, "metadata": m} for i, d, m in zip(ids, docs, metas)]
