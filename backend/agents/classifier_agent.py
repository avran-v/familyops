import json
import os
from openai import OpenAI

CATEGORIES = [
    "Housing", "Transportation", "Food", "Utilities", "Healthcare",
    "Entertainment", "Shopping", "Savings", "Income", "Subscriptions", "Other",
]


class ClassifierAgent:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def classify_transaction(self, transaction: dict, context: list[str] | None = None) -> dict:
        context_str = "\n".join(f"- {c}" for c in (context or [])) or "No historical context available."

        prompt = f"""You are a transaction classifier for a family finance system.

Transaction: ${transaction['amount']:.2f} - {transaction['description']}
Owner: {transaction['owner']}

Historical context from similar transactions:
{context_str}

Classify this transaction. Return ONLY valid JSON (no markdown fences):
{{
  "category": "one of: {', '.join(CATEGORIES)}",
  "tags": ["tag1", "tag2"],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of classification"
}}"""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        return json.loads(text)
