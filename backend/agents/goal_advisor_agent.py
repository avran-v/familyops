import json
import os
from openai import OpenAI
from .web_search import search_alternatives, search_current_price, search_web


class GoalAdvisorAgent:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def _research_subscriptions(self, transactions: list[dict]) -> str:
        """Use web search to get current pricing for subscriptions found in transactions."""
        sub_txns = [t for t in transactions if t.get("category") == "Subscriptions"]
        if not sub_txns:
            return ""

        seen = set()
        lines = ["\nWEB RESEARCH — CURRENT PRICING & ALTERNATIVES:"]
        for t in sub_txns:
            name = t["description"].split(" - ")[0].split(" subscription")[0].strip()
            if name in seen:
                continue
            seen.add(name)

            price_results = search_current_price(name)
            alt_results = search_alternatives(name)

            if price_results:
                lines.append(f"\n  {name} — current pricing research:")
                for r in price_results[:2]:
                    lines.append(f"    [{r['title']}]({r['url']})")
                    lines.append(f"    {r['content'][:200]}")

            if alt_results:
                lines.append(f"  Alternatives to {name}:")
                for r in alt_results[:3]:
                    lines.append(f"    [{r['title']}]({r['url']})")
                    lines.append(f"    {r['content'][:200]}")

        return "\n".join(lines) if len(lines) > 1 else ""

    def _research_large_categories(self, cat_totals: dict[str, float]) -> str:
        """Search for cost-saving tips for the biggest spending categories."""
        lines = []
        top_cats = sorted(cat_totals.items(), key=lambda x: -x[1])[:3]
        for cat, total in top_cats:
            if cat in ("Housing",):
                continue
            results = search_web(f"how to save money on {cat.lower()} family budget tips 2026", max_results=3)
            if results:
                lines.append(f"\n  {cat} (${total:,.2f}) — savings research:")
                for r in results[:2]:
                    lines.append(f"    [{r['title']}]({r['url']})")
                    lines.append(f"    {r['content'][:200]}")
        return "\n".join(lines) if lines else ""

    def _precompute_financials(self, goals: list[dict], transactions: list[dict]) -> str:
        """Do the math in Python so the LLM doesn't have to guess at arithmetic."""
        lines = []

        total_income = sum(t["amount"] for t in transactions if t.get("category") == "Income")
        total_expense = sum(t["amount"] for t in transactions if t.get("category") != "Income")
        lines.append(f"TOTAL INCOME (in data window): ${total_income:,.2f}")
        lines.append(f"TOTAL EXPENSES (in data window): ${total_expense:,.2f}")
        lines.append(f"NET: ${total_income - total_expense:,.2f}")
        lines.append("")

        cat_totals: dict[str, float] = {}
        cat_txn_ids: dict[str, list[int]] = {}
        for t in transactions:
            cat = t.get("category") or "Other"
            if cat == "Income":
                continue
            cat_totals[cat] = cat_totals.get(cat, 0) + t["amount"]
            cat_txn_ids.setdefault(cat, []).append(t["id"])

        lines.append("EXPENSE BREAKDOWN BY CATEGORY:")
        for cat, total in sorted(cat_totals.items(), key=lambda x: -x[1]):
            ids = cat_txn_ids[cat]
            lines.append(f"  {cat}: ${total:,.2f} across {len(ids)} transactions (IDs: {ids})")

        sub_txns = [t for t in transactions if t.get("category") == "Subscriptions"]
        if sub_txns:
            sub_total = sum(t["amount"] for t in sub_txns)
            lines.append(f"\nSUBSCRIPTIONS DETAIL (total: ${sub_total:,.2f}/period):")
            for t in sub_txns:
                lines.append(f"  ID {t['id']}: {t['description']} — ${t['amount']:.2f} on {t['date']}")

        lines.append("\nGOAL PROGRESS:")
        for g in goals:
            remaining = g["target_amount"] - g.get("current_amount", 0)
            pct = (g.get("current_amount", 0) / g["target_amount"] * 100) if g["target_amount"] > 0 else 0
            lines.append(
                f"  {g['name']}: ${g.get('current_amount', 0):,.2f} / ${g['target_amount']:,.2f} "
                f"({pct:.1f}%) — ${remaining:,.2f} remaining, deadline {g.get('deadline', 'N/A')}"
            )

        return "\n".join(lines)

    def generate_recommendations(
        self,
        goals: list[dict],
        transactions: list[dict],
        context: list[str] | None = None,
        feedback_summary: str = "",
        preferences: dict[str, str] | None = None,
    ) -> list[dict]:
        context_str = "\n".join(f"- {c}" for c in (context or [])) or "No prior recommendations context."
        financials = self._precompute_financials(goals, transactions)
        goals_json = json.dumps(goals[:10], indent=2, default=str)
        txns_json = json.dumps(transactions[:50], indent=2, default=str)

        # Web research for current prices and alternatives
        cat_totals: dict[str, float] = {}
        for t in transactions:
            cat = t.get("category") or "Other"
            if cat != "Income":
                cat_totals[cat] = cat_totals.get(cat, 0) + t["amount"]

        web_research = self._research_subscriptions(transactions)
        web_research += self._research_large_categories(cat_totals)
        web_section = ""
        if web_research:
            web_section = f"\n\n=== WEB RESEARCH (current prices verified via web search) ===\n{web_research}"

        prefs_str = ""
        if preferences:
            prefs_str = "\n\nUSER PREFERENCES (respect these — the user explicitly stated these):\n" + "\n".join(f"- {k}: {v}" for k, v in preferences.items())
        feedback_str = ""
        if feedback_summary and feedback_summary != "No user feedback yet.":
            feedback_str = f"\n\nPAST USER FEEDBACK on recommendations (learn from this — avoid similar rejected patterns, lean into accepted ones):\n{feedback_summary}"

        prompt = f"""You are a financial advisor for a family household. Analyze their goals and recent spending to generate actionable recommendations.

=== PRE-COMPUTED FINANCIALS (use these numbers, do NOT recalculate) ===
{financials}

=== RAW DATA (for reference/IDs only) ===
Goals:
{goals_json}

Transactions:
{txns_json}

Past decisions & context:
{context_str}{prefs_str}{feedback_str}{web_section}

Generate 3-5 specific, actionable recommendations. CRITICAL RULES:
1. Use ONLY the dollar amounts from the PRE-COMPUTED FINANCIALS section — do not invent or miscalculate numbers
2. Reference specific transactions by their "id" field
3. For optimization suggestions, propose concrete alternatives with estimated costs
4. If WEB RESEARCH is available, use the real prices and URLs from it — include URLs in the alternatives "notes" field
5. Show how savings connect to goal timelines using the GOAL PROGRESS numbers above
6. If USER PREFERENCES exist, RESPECT them — do not suggest canceling something the user said they want to keep
7. If PAST USER FEEDBACK exists, learn from it — avoid patterns the user has rejected before

Return ONLY a valid JSON array (no markdown fences):
[{{
  "type": "reallocation|alert|suggestion|goal_health|optimize",
  "title": "Brief title",
  "description": "What to do (2-3 sentences with specific dollar amounts from the financials above)",
  "reasoning": "Detailed explanation — cite the pre-computed totals and specific transaction IDs",
  "confidence": "high|medium|low",
  "action_data": {{
    "goal_affected": "goal name if relevant",
    "amount": 0,
    "monthly_savings": 0,
    "related_transaction_ids": [1, 2, 3],
    "current_spend": 0,
    "proposed_spend": 0,
    "alternatives": [
      {{"name": "alternative option", "estimated_cost": 0, "notes": "brief note", "url": "https://... or empty"}}
    ]
  }}
}}]"""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        return json.loads(text)

    def generate_feedback_options(self, rec: dict, action: str) -> list[str]:
        """Generate contextual feedback tag options for a user accepting/rejecting a recommendation."""
        prompt = f"""A user just {action}ED this financial recommendation:
Title: "{rec['title']}"
Type: {rec['type']}
Description: {rec['description']}

Generate 5-6 short feedback tags (2-4 words each) the user might select to explain WHY they {action}ed it.
{"For ACCEPT, tags should reflect what they liked." if action == "accept" else "For REJECT, tags should reflect what they disliked or found unreasonable."}

Return ONLY a JSON array of strings (no markdown fences):
["tag1", "tag2", "tag3", "tag4", "tag5"]"""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)

    def chat_about_recommendation(self, rec: dict, user_message: str, chat_history: list[dict], preferences: dict[str, str] | None = None) -> str:
        prefs_str = ""
        if preferences:
            prefs_str = "\nUser preferences: " + ", ".join(f"{k}={v}" for k, v in preferences.items())

        messages = [
            {"role": "system", "content": f"""You are a helpful family finance advisor discussing a specific recommendation with the user. Be conversational and helpful.

The recommendation:
- Title: {rec['title']}
- Type: {rec['type']}
- Description: {rec['description']}
- Reasoning: {rec['reasoning']}
- Action data: {json.dumps(rec.get('action_data', {}))}{prefs_str}

If the user expresses preferences (e.g. "I don't want to cancel Netflix", "we prefer organic groceries"), acknowledge them and adjust your advice. Note any stated preferences so the system can save them."""}
        ]

        for msg in chat_history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=500,
            messages=messages,
        )
        return response.choices[0].message.content.strip()
