import json
import os
from openai import OpenAI


class ScenarioPlannerAgent:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def run_scenario(self, scenario_text: str, goals: list[dict], transactions: list[dict]) -> dict:
        goals_json = json.dumps(goals[:10], indent=2, default=str)
        txns_json = json.dumps(transactions[:20], indent=2, default=str)

        prompt = f"""You are a financial scenario planner for a family. The user wants to explore a what-if scenario.

Scenario: "{scenario_text}"

Current Goals:
{goals_json}

Recent Transactions:
{txns_json}

Analyze the scenario and return ONLY valid JSON (no markdown fences):
{{
  "scenario_summary": "1-2 sentence plain-language summary",
  "impact_on_goals": [
    {{
      "goal_name": "...",
      "current_timeline": "when they'd reach it now",
      "new_timeline": "when they'd reach it under this scenario",
      "delta_days": 0,
      "explanation": "brief"
    }}
  ],
  "trade_offs": ["trade-off 1", "trade-off 2"],
  "recommendation": "what you'd suggest the family do"
}}"""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        return json.loads(text)
