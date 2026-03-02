import json
import os
from openai import OpenAI


class AnomalyDetectorAgent:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def check_anomaly(self, transaction: dict, similar_transactions: list[str] | None = None) -> dict:
        similar_str = "\n".join(f"- {s}" for s in (similar_transactions or [])) or "No similar transactions found."

        prompt = f"""You are an anomaly detector for a family finance system. Decide if this transaction is unusual.

Transaction: ${transaction['amount']:.2f} - {transaction['description']}
Owner: {transaction['owner']}
Category: {transaction.get('category', 'unknown')}

Similar past transactions:
{similar_str}

Evaluate if this is anomalous. Return ONLY valid JSON (no markdown fences):
{{
  "is_anomaly": true or false,
  "risk_level": "low|medium|high",
  "reasoning": "brief explanation",
  "suggestion": "what the family should do if anomalous, or 'none' if normal"
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
