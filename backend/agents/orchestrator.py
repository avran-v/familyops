import json
import os
from openai import OpenAI

from .classifier_agent import ClassifierAgent
from .goal_advisor_agent import GoalAdvisorAgent
from .anomaly_detector_agent import AnomalyDetectorAgent
from .scenario_planner_agent import ScenarioPlannerAgent
from ..rag.vector_store import RAGStore
from ..db import database as db


class AgentOrchestrator:
    def __init__(self, rag_store: RAGStore):
        self.classifier = ClassifierAgent()
        self.advisor = GoalAdvisorAgent()
        self.anomaly = AnomalyDetectorAgent()
        self.scenario = ScenarioPlannerAgent()
        self.rag = rag_store
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    # ---- transaction pipeline ----

    async def process_new_transaction(self, txn: dict) -> dict:
        similar = self.rag.search_similar(txn["description"], n_results=3, filter_type="transaction")
        context_docs = [s["document"] for s in similar]

        classification = self.classifier.classify_transaction(txn, context_docs)
        txn["category"] = classification.get("category", "Other")
        txn["tags"] = classification.get("tags", [])
        txn["ai_confidence"] = classification.get("confidence", 0.5)
        txn["ai_reasoning"] = classification.get("reasoning", "")
        # Keep explicit user tags from command palette, merged with classifier tags.
        user_tags = txn.get("user_tags") or txn.get("tags") or []
        if user_tags:
            merged = {str(t).strip().lower() for t in txn["tags"] if str(t).strip()}
            merged.update({str(t).strip().lower() for t in user_tags if str(t).strip()})
            txn["tags"] = sorted(merged)

        row_id = db.insert_transaction(txn)
        txn["id"] = row_id

        self.rag.add_transaction_memory(txn)

        anomaly_result = self.anomaly.check_anomaly(txn, context_docs)

        if anomaly_result.get("is_anomaly"):
            db.insert_recommendation({
                "type": "alert",
                "title": f"Unusual transaction: {txn['description']}",
                "description": anomaly_result.get("suggestion", "Review this transaction."),
                "reasoning": anomaly_result.get("reasoning", ""),
                "confidence": anomaly_result.get("risk_level", "medium"),
                "action_data": {"transaction_id": row_id},
            })

        return {"transaction": txn, "classification": classification, "anomaly": anomaly_result}

    # ---- ai sweep ----

    async def run_ai_sweep(self) -> list[dict]:
        goals = db.get_goals()
        transactions = db.get_transactions(limit=50)

        rag_context = self.rag.search_similar("family spending goals recommendations", n_results=5)
        context_docs = [s["document"] for s in rag_context]

        feedback_summary = db.get_all_feedback_summary()
        preferences = db.get_preferences()

        recommendations = self.advisor.generate_recommendations(
            goals, transactions, context_docs,
            feedback_summary=feedback_summary,
            preferences=preferences,
        )

        saved = []
        for rec in recommendations:
            rec_id = db.insert_recommendation(rec)
            rec["id"] = rec_id
            rec["created_at"] = __import__("datetime").datetime.utcnow().isoformat()
            self.rag.add_recommendation_memory(rec)
            saved.append(rec)

        return saved

    # ---- natural language command ----

    async def process_nl_command(self, command_text: str) -> dict:
        prompt = f"""Parse this family finance command and return ONLY valid JSON (no markdown).

Command: "{command_text}"

Return:
{{
  "intent": "add_transaction|edit_transaction|show_goals|what_if|explain|query|run_sweep",
  "parameters": {{
    "transaction_id": number or null,
    "amount": number or null,
    "description": string or null,
    "owner": string or null,
    "date": string (ISO date) or null,
    "tags": [string] or null,
    "query": string or null,
    "scenario": string or null
  }},
  "confidence": 0.0-1.0,
  "response_text": "A friendly 1-sentence confirmation or clarification"
}}"""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        intent_data = json.loads(text)

        if intent_data["intent"] == "add_transaction":
            p = intent_data["parameters"]
            if p.get("amount") and p.get("description"):
                proposal = {
                    "proposal_type": "add",
                    "amount": float(p["amount"]),
                    "description": p["description"],
                    "owner": p.get("owner") or "Household",
                    "date": p.get("date") or __import__("datetime").datetime.utcnow().isoformat(),
                    "tags": p.get("tags") or [],
                    "command_text": command_text,
                    "source": "command_palette",
                }
                proposal_id = db.insert_transaction_proposal(proposal)
                proposal["id"] = proposal_id
                proposal["status"] = "pending"
                intent_data["response_text"] = "Draft transaction created. Review it in Timeline and approve to apply."
                intent_data["data"] = {"proposal": proposal, "requires_approval": True}

        elif intent_data["intent"] == "edit_transaction":
            p = intent_data["parameters"]
            target_txn = None
            txn_id = p.get("transaction_id")
            if txn_id:
                target_txn = db.get_transaction_by_id(int(txn_id))
            if not target_txn and p.get("description"):
                candidates = db.get_transactions(limit=200)
                query = str(p["description"]).lower()
                target_txn = next((t for t in candidates if query in t["description"].lower()), None)
            if target_txn:
                proposal = {
                    "proposal_type": "edit",
                    "original_transaction_id": target_txn["id"],
                    "amount": p.get("amount", target_txn["amount"]),
                    "description": p.get("description", target_txn["description"]),
                    "owner": p.get("owner", target_txn["owner"]),
                    "date": p.get("date", target_txn["date"]),
                    "tags": p.get("tags", target_txn.get("tags", [])),
                    "command_text": command_text,
                    "source": "command_palette",
                }
                proposal_id = db.insert_transaction_proposal(proposal)
                proposal["id"] = proposal_id
                proposal["status"] = "pending"
                intent_data["response_text"] = "Draft edit created. Review it in Timeline and approve to apply."
                intent_data["data"] = {"proposal": proposal, "requires_approval": True}
            else:
                intent_data["response_text"] = "I couldn't find the transaction to edit. Please include transaction id or clearer description."
                intent_data["data"] = {"requires_approval": False}

        elif intent_data["intent"] == "what_if":
            scenario_text = intent_data["parameters"].get("scenario") or command_text
            goals = db.get_goals()
            transactions = db.get_transactions(limit=30)
            result = self.scenario.run_scenario(scenario_text, goals, transactions)
            intent_data["data"] = result

        elif intent_data["intent"] == "run_sweep":
            recs = await self.run_ai_sweep()
            intent_data["data"] = {"recommendations": recs}

        elif intent_data["intent"] == "query":
            query = intent_data["parameters"].get("query") or command_text
            results = self.rag.search_similar(query, n_results=5)
            intent_data["data"] = {"results": results}

        return intent_data

    # ---- explain a classification ----

    async def explain_transaction(self, txn_id: int) -> dict:
        transactions = db.get_transactions()
        txn = next((t for t in transactions if t["id"] == txn_id), None)
        if not txn:
            return {"error": "Transaction not found"}

        similar = self.rag.search_similar(txn["description"], n_results=5, filter_type="transaction")

        return {
            "transaction": txn,
            "similar_transactions": similar,
            "ai_confidence": txn.get("ai_confidence"),
            "ai_reasoning": txn.get("ai_reasoning"),
        }
