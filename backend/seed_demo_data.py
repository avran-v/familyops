"""Seed the SQLite DB + ChromaDB with realistic demo data."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.db.database import (
    init_db, insert_transaction, insert_goal,
    get_transactions, get_goals, insert_recommendation_with_date,
)
from backend.rag.vector_store import RAGStore

DEMO_TRANSACTIONS = [
    {"amount": 2000.00, "description": "City Apartments - Rent", "category": "Housing", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-03-01"},
    {"amount": 19.99, "description": "Netflix subscription", "category": "Subscriptions", "tags": ["subscription", "entertainment"], "owner": "Alex", "date": "2026-03-01"},
    {"amount": 156.40, "description": "Grocery Mart weekly shop", "category": "Food", "tags": ["groceries", "shared"], "owner": "Alex", "date": "2026-02-28"},
    {"amount": 45.00, "description": "Gas station fill-up", "category": "Transportation", "tags": ["fuel"], "owner": "Alex", "date": "2026-02-27"},
    {"amount": 120.00, "description": "Electric bill - February", "category": "Utilities", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-02-25"},
    {"amount": 85.00, "description": "Water & sewage bill", "category": "Utilities", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-02-25"},
    {"amount": 14.99, "description": "Spotify Family plan", "category": "Subscriptions", "tags": ["subscription", "entertainment"], "owner": "Alex", "date": "2026-02-24"},
    {"amount": 67.50, "description": "Sam's new sneakers", "category": "Shopping", "tags": ["clothing", "teen"], "owner": "Sam", "date": "2026-02-23"},
    {"amount": 12.00, "description": "Mia's art supplies", "category": "Shopping", "tags": ["school", "child"], "owner": "Mia", "date": "2026-02-22"},
    {"amount": 340.00, "description": "Family dinner at Olive Garden", "category": "Food", "tags": ["dining", "shared"], "owner": "Alex", "date": "2026-02-21"},
    {"amount": 55.00, "description": "Internet bill - Comcast", "category": "Utilities", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-02-20"},
    {"amount": 200.00, "description": "Auto insurance monthly", "category": "Transportation", "tags": ["insurance", "bill"], "owner": "Alex", "date": "2026-02-19"},
    {"amount": 32.00, "description": "Sam's haircut", "category": "Healthcare", "tags": ["personal", "teen"], "owner": "Sam", "date": "2026-02-18"},
    {"amount": 150.00, "description": "Doctor co-pay - Mia checkup", "category": "Healthcare", "tags": ["medical", "child"], "owner": "Alex", "date": "2026-02-17"},
    {"amount": 89.99, "description": "Amazon - household supplies", "category": "Shopping", "tags": ["household", "shared"], "owner": "Alex", "date": "2026-02-16"},
    {"amount": 25.00, "description": "Sam's allowance", "category": "Other", "tags": ["allowance", "teen"], "owner": "Sam", "date": "2026-02-15"},
    {"amount": 10.00, "description": "Mia's allowance", "category": "Other", "tags": ["allowance", "child"], "owner": "Mia", "date": "2026-02-15"},
    {"amount": 175.00, "description": "Grocery Mart big restock", "category": "Food", "tags": ["groceries", "shared"], "owner": "Alex", "date": "2026-02-14"},
    {"amount": 42.00, "description": "Gas station fill-up", "category": "Transportation", "tags": ["fuel"], "owner": "Alex", "date": "2026-02-13"},
    {"amount": 59.99, "description": "Sam's video game (Steam)", "category": "Entertainment", "tags": ["gaming", "teen"], "owner": "Sam", "date": "2026-02-12"},
    {"amount": 22.50, "description": "Mia's swim class", "category": "Entertainment", "tags": ["activity", "child"], "owner": "Alex", "date": "2026-02-11"},
    {"amount": 130.00, "description": "Grocery Mart", "category": "Food", "tags": ["groceries", "shared"], "owner": "Alex", "date": "2026-02-10"},
    {"amount": 2000.00, "description": "City Apartments - Rent", "category": "Housing", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-02-01"},
    {"amount": 19.99, "description": "Netflix subscription", "category": "Subscriptions", "tags": ["subscription", "entertainment"], "owner": "Alex", "date": "2026-02-01"},
    {"amount": 75.00, "description": "Phone bill - T-Mobile family", "category": "Utilities", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-02-01"},
    {"amount": 310.00, "description": "Unknown merchant - XFER9921", "category": "Other", "tags": ["unknown"], "owner": "Alex", "date": "2026-01-30"},
    {"amount": 45.00, "description": "Uber rides x3", "category": "Transportation", "tags": ["rideshare"], "owner": "Sam", "date": "2026-01-29"},
    {"amount": 18.00, "description": "School lunch top-up", "category": "Food", "tags": ["school", "child"], "owner": "Mia", "date": "2026-01-28"},
    {"amount": 250.00, "description": "Weekend getaway Airbnb", "category": "Entertainment", "tags": ["travel", "shared"], "owner": "Alex", "date": "2026-01-27"},
    {"amount": 95.00, "description": "Target - clothes & misc", "category": "Shopping", "tags": ["clothing", "shared"], "owner": "Alex", "date": "2026-01-26"},
    {"amount": 160.00, "description": "Grocery Mart", "category": "Food", "tags": ["groceries", "shared"], "owner": "Alex", "date": "2026-01-25"},
    {"amount": 35.00, "description": "Gym membership - Planet Fitness", "category": "Healthcare", "tags": ["fitness", "personal"], "owner": "Alex", "date": "2026-01-24"},
    {"amount": 14.99, "description": "Spotify Family plan", "category": "Subscriptions", "tags": ["subscription", "entertainment"], "owner": "Alex", "date": "2026-01-24"},
    {"amount": 120.00, "description": "Electric bill - January", "category": "Utilities", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-01-23"},
    {"amount": 85.00, "description": "Water & sewage bill", "category": "Utilities", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-01-23"},
    {"amount": 200.00, "description": "Auto insurance monthly", "category": "Transportation", "tags": ["insurance", "bill"], "owner": "Alex", "date": "2026-01-20"},
    {"amount": 48.00, "description": "Gas station fill-up", "category": "Transportation", "tags": ["fuel"], "owner": "Alex", "date": "2026-01-18"},
    {"amount": 28.00, "description": "Mia's birthday party supplies", "category": "Shopping", "tags": ["party", "child"], "owner": "Alex", "date": "2026-01-17"},
    {"amount": 500.00, "description": "Freelance payment received", "category": "Income", "tags": ["income", "freelance"], "owner": "Alex", "date": "2026-01-16"},
    {"amount": 3500.00, "description": "Salary deposit", "category": "Income", "tags": ["income", "salary"], "owner": "Alex", "date": "2026-01-15"},
    {"amount": 25.00, "description": "Sam's allowance", "category": "Other", "tags": ["allowance", "teen"], "owner": "Sam", "date": "2026-01-15"},
    {"amount": 10.00, "description": "Mia's allowance", "category": "Other", "tags": ["allowance", "child"], "owner": "Mia", "date": "2026-01-15"},
    {"amount": 55.00, "description": "Internet bill - Comcast", "category": "Utilities", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-01-14"},
    {"amount": 135.00, "description": "Grocery Mart", "category": "Food", "tags": ["groceries", "shared"], "owner": "Alex", "date": "2026-01-12"},
    {"amount": 65.00, "description": "Sam's tutoring session", "category": "Other", "tags": ["education", "teen"], "owner": "Alex", "date": "2026-01-11"},
    {"amount": 19.99, "description": "Disney+ subscription", "category": "Subscriptions", "tags": ["subscription", "entertainment"], "owner": "Alex", "date": "2026-01-10"},
    {"amount": 2000.00, "description": "City Apartments - Rent", "category": "Housing", "tags": ["bill", "shared"], "owner": "Alex", "date": "2026-01-01"},
    {"amount": 400.00, "description": "Holiday gifts - family", "category": "Shopping", "tags": ["gifts", "shared"], "owner": "Alex", "date": "2025-12-23"},
    {"amount": 220.00, "description": "Holiday dinner groceries", "category": "Food", "tags": ["groceries", "shared"], "owner": "Alex", "date": "2025-12-22"},
    {"amount": 180.00, "description": "Winter jackets - Sam & Mia", "category": "Shopping", "tags": ["clothing", "shared"], "owner": "Alex", "date": "2025-12-15"},
]

DEMO_GOALS = [
    {"name": "Summer trip fund", "icon": "🛫", "target_amount": 3000, "current_amount": 1800, "deadline": "2026-07-01", "priority": "high", "status": "active", "summary": "Family vacation savings — AI tracks how choices affect the timeline."},
    {"name": "Emergency cushion", "icon": "🛟", "target_amount": 5000, "current_amount": 2600, "deadline": "2026-12-31", "priority": "high", "status": "active", "summary": "Safety net that grows over time through small, consistent decisions."},
    {"name": "Mia & Sam allowance pot", "icon": "🎨", "target_amount": 600, "current_amount": 220, "deadline": "2026-06-15", "priority": "medium", "status": "active", "summary": "Teaching money skills through a shared family pot."},
    {"name": "Laptop upgrade (finished)", "icon": "💻", "target_amount": 1200, "current_amount": 1200, "deadline": "2025-11-01", "priority": "low", "status": "archived", "summary": "Completed goal — saved up by trimming subscriptions and small cuts."},
]

DEMO_RECOMMENDATIONS = [
    # Today (March 2)
    {
        "type": "optimize",
        "title": "Consolidate streaming subscriptions",
        "description": "You're paying $54.97/mo across Netflix ($19.99), Spotify ($14.99), and Disney+ ($19.99). Consider bundling with a Disney+/Hulu combo at $9.99/mo and keeping Spotify, saving ~$25/mo.",
        "reasoning": "Three separate streaming services totaling $54.97/mo were found in transactions (IDs 2, 7, 46). Switching to a Disney+/Hulu bundle and keeping Spotify would reduce this to ~$24.98/mo. The $30/mo savings accelerates the Summer trip fund by approximately 3 weeks.",
        "confidence": "high",
        "action_data": {"goal_affected": "Summer trip fund", "monthly_savings": 30, "current_spend": 54.97, "proposed_spend": 24.98, "related_transaction_ids": [2, 7, 46], "alternatives": [{"name": "Disney+/Hulu Bundle", "estimated_cost": 9.99, "notes": "Replaces standalone Disney+ ($19.99)"}, {"name": "YouTube Premium Family", "estimated_cost": 22.99, "notes": "Includes YouTube Music, replaces Spotify + ad-free YouTube"}, {"name": "Apple One Family", "estimated_cost": 22.95, "notes": "Includes TV+, Music, Arcade, iCloud"}]},
        "status": "pending",
        "date": "2026-03-02 09:15:00",
    },
    {
        "type": "alert",
        "title": "Unknown merchant charge: $310",
        "description": "Transaction XFER9921 for $310.00 on Jan 30 doesn't match any known vendor pattern. This could be a legitimate transfer or an unauthorized charge — worth verifying with your bank.",
        "reasoning": "Transaction ID 26 shows an 'Unknown merchant - XFER9921' charge of $310.00. No similar merchant appears in any other transaction. The amount is significant relative to your monthly discretionary budget.",
        "confidence": "medium",
        "action_data": {"related_transaction_ids": [26], "amount": 310},
        "status": "pending",
        "date": "2026-03-02 09:15:00",
    },
    {
        "type": "goal_health",
        "title": "Summer trip fund needs $300/mo to stay on track",
        "description": "With $1,200 remaining and 4 months until the July deadline, you need to save $300/mo. Current trajectory based on the last 2 months suggests you're saving ~$200/mo toward this goal — a $100/mo shortfall.",
        "reasoning": "Goal 'Summer trip fund' is at $1,800/$3,000 (60%) with a July 1 deadline. That's roughly 4 months away, requiring $300/mo. Redirecting savings from the streaming optimization ($30/mo) plus reducing one dining-out per month (~$70 based on the $340 Olive Garden visit) would close the gap.",
        "confidence": "high",
        "action_data": {"goal_affected": "Summer trip fund", "amount": 1200, "monthly_savings": 100, "related_transaction_ids": [10]},
        "status": "pending",
        "date": "2026-03-02 09:15:00",
    },
    # Yesterday (March 1)
    {
        "type": "suggestion",
        "title": "Switch auto insurance to a 6-month prepay",
        "description": "You're paying $200/mo for auto insurance (IDs 12, 36). Many insurers offer 5-10% discounts for 6-month prepayment. At 8% discount, that's $96 saved per year ($8/mo).",
        "reasoning": "Two auto insurance payments of $200 each found in the data (IDs 12 and 36), confirming a recurring monthly expense. Prepaying 6 months ($1,200) at an 8% discount would cost $1,104, saving $96 annually. This is a low-effort optimization.",
        "confidence": "medium",
        "action_data": {"monthly_savings": 8, "current_spend": 200, "proposed_spend": 184, "related_transaction_ids": [12, 36], "alternatives": [{"name": "GEICO 6-mo prepay", "estimated_cost": 184, "notes": "~8% discount for prepayment"}, {"name": "Progressive Snapshot", "estimated_cost": 170, "notes": "Usage-based pricing, could save more"}]},
        "status": "pending",
        "date": "2026-03-01 14:30:00",
    },
    {
        "type": "reallocation",
        "title": "Pause allowance pot contributions temporarily",
        "description": "The Mia & Sam allowance pot ($220/$600) has a June 15 deadline but lower priority than the Summer trip fund. Consider pausing contributions for 2 months and redirecting $70/mo to the trip fund.",
        "reasoning": "The allowance pot is at 37% with 3.5 months remaining — it needs ~$109/mo to complete on time. The Summer trip fund is higher priority and has a tighter timeline. Pausing allowance contributions for 2 months redirects $140 total toward the trip, then resuming with catch-up contributions.",
        "confidence": "medium",
        "action_data": {"goal_affected": "Mia & Sam allowance pot", "monthly_savings": 70, "amount": 140},
        "status": "pending",
        "date": "2026-03-01 14:30:00",
    },
    # 2 days ago (Feb 28)
    {
        "type": "optimize",
        "title": "Grocery spending trending high — try meal planning",
        "description": "Grocery spending over the last 8 weeks totals $776.40 across 5 trips ($155/trip avg). Meal planning typically reduces grocery bills by 15-25%. At 20% savings, that's ~$155/mo saved.",
        "reasoning": "Grocery transactions (IDs 3, 18, 22, 31, 44) total $756.40 plus the holiday groceries. The average trip is $151.28. National average for a family of 4 is ~$250/week ($1,000/mo). You're under that, but meal planning and a Costco membership could save 15-25%.",
        "confidence": "medium",
        "action_data": {"goal_affected": "Emergency cushion", "monthly_savings": 155, "current_spend": 776, "proposed_spend": 621, "related_transaction_ids": [3, 18, 22, 31, 44], "alternatives": [{"name": "Costco membership", "estimated_cost": 5, "notes": "$60/year, bulk savings 20-30% on staples"}, {"name": "Meal kit (HelloFresh)", "estimated_cost": 160, "notes": "Reduces waste but similar cost"}, {"name": "Walmart Grocery pickup", "estimated_cost": 0, "notes": "Free service, reduces impulse buys by ~20%"}]},
        "status": "accepted",
        "date": "2026-02-28 08:00:00",
    },
    {
        "type": "goal_health",
        "title": "Emergency cushion on track — steady progress",
        "description": "Emergency cushion is at $2,600/$5,000 (52%) with 10 months until year-end. You need $240/mo to hit the target, which aligns with your recent saving rate. Keep it up!",
        "reasoning": "Goal is 52% complete with 10 months remaining. Required monthly contribution of $240 is achievable based on current income-to-expense ratio. No action needed — this is a positive status update.",
        "confidence": "high",
        "action_data": {"goal_affected": "Emergency cushion", "amount": 2400},
        "status": "accepted",
        "date": "2026-02-28 08:00:00",
    },
    # 4 days ago (Feb 26)
    {
        "type": "alert",
        "title": "Dining out spike — $340 single dinner",
        "description": "The Olive Garden dinner on Feb 21 cost $340 — that's more than double a typical family dinner out. Consider setting a per-occasion dining budget of $150.",
        "reasoning": "Transaction ID 10 is $340.00 at Olive Garden. For context, this single dinner equals roughly 2 weeks of groceries based on your average grocery spending ($155/trip). Setting a dining budget helps keep discretionary spending aligned with goals.",
        "confidence": "high",
        "action_data": {"related_transaction_ids": [10], "amount": 340, "current_spend": 340, "proposed_spend": 150, "monthly_savings": 190},
        "status": "rejected",
        "date": "2026-02-26 16:45:00",
    },
    # 6 days ago (Feb 24)
    {
        "type": "suggestion",
        "title": "Sam's Steam purchase — consider game library sharing",
        "description": "Sam spent $59.99 on a Steam game. Steam Family Sharing lets family members share game libraries for free. Setting up sharing could avoid duplicate purchases across accounts.",
        "reasoning": "Transaction ID 20 shows a $59.99 Steam purchase by Sam. If multiple family members game, Steam Family Sharing is free and prevents buying the same game twice. This is a one-time setup with recurring savings potential.",
        "confidence": "low",
        "action_data": {"related_transaction_ids": [20], "amount": 59.99, "monthly_savings": 15},
        "status": "accepted",
        "date": "2026-02-24 10:20:00",
    },
    # Last week (Feb 22)
    {
        "type": "optimize",
        "title": "Utility bill review — compare electric providers",
        "description": "Electric bills of $120/mo are above the national average of $95/mo for similar household sizes. Check if your area allows provider switching or request an energy audit.",
        "reasoning": "Electric bills (IDs 5, 34) show $120/mo consistently. Water is $85/mo (IDs 6, 35). Combined utilities of $260/mo + Internet ($55) + Phone ($75) total $390/mo. Electric is the most optimizable component.",
        "confidence": "medium",
        "action_data": {"monthly_savings": 25, "current_spend": 120, "proposed_spend": 95, "related_transaction_ids": [5, 34], "alternatives": [{"name": "Green Mountain Energy", "estimated_cost": 95, "notes": "Competitive rate, renewable energy"}, {"name": "Energy audit + LED swap", "estimated_cost": 100, "notes": "One-time cost, saves $15-30/mo long term"}]},
        "status": "pending",
        "date": "2026-02-22 11:00:00",
    },
]


def seed():
    print("Initializing database...")
    init_db()

    print(f"Inserting {len(DEMO_TRANSACTIONS)} transactions...")
    for txn in DEMO_TRANSACTIONS:
        txn.setdefault("ai_confidence", 0.85)
        txn.setdefault("ai_reasoning", "Pre-seeded demo data")
        insert_transaction(txn)

    print(f"Inserting {len(DEMO_GOALS)} goals...")
    for goal in DEMO_GOALS:
        insert_goal(goal)

    print(f"Inserting {len(DEMO_RECOMMENDATIONS)} historical recommendations...")
    for rec in DEMO_RECOMMENDATIONS:
        created_at = rec.pop("date")
        insert_recommendation_with_date(rec, created_at)

    print("Indexing into ChromaDB for RAG...")
    rag = RAGStore()
    for txn in get_transactions():
        rag.add_transaction_memory(txn)
    for goal in get_goals():
        rag.add_goal_memory(goal)

    print(f"Done! {len(DEMO_TRANSACTIONS)} transactions, {len(DEMO_GOALS)} goals, {len(DEMO_RECOMMENDATIONS)} recommendations seeded.")


if __name__ == "__main__":
    seed()
