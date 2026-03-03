from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..models.schemas import Transaction, Goal, CommandRequest
from ..db import database as db

router = APIRouter(prefix="/api")


# ---- transactions ----

@router.post("/transactions")
async def create_transaction(transaction: Transaction, request: Request):
    orchestrator = request.app.state.orchestrator
    result = await orchestrator.process_new_transaction(transaction.model_dump(mode="json"))
    return result


@router.get("/transactions")
async def get_transactions(owner: str | None = None, limit: int = 200):
    return db.get_transactions(owner=owner, limit=limit)


@router.get("/transaction-proposals")
async def get_transaction_proposals(status: str = "pending", limit: int = 100):
    return db.get_transaction_proposals(status=status, limit=limit)


@router.post("/transaction-proposals/{proposal_id}/approve")
async def approve_transaction_proposal(proposal_id: int, request: Request):
    proposal = db.get_transaction_proposal_by_id(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] != "pending":
        raise HTTPException(400, "Proposal already processed")

    orchestrator = request.app.state.orchestrator
    if proposal["proposal_type"] == "add":
        raw_date = (proposal.get("date") or "")[:10]
        result = await orchestrator.process_new_transaction({
            "amount": proposal["amount"],
            "description": proposal["description"],
            "owner": proposal["owner"] or "Household",
            "date": raw_date,
            "user_tags": proposal.get("tags", []),
        })
        db.update_transaction_proposal_status(proposal_id, "approved")
        return {"ok": True, "applied": result["transaction"]}

    if proposal["proposal_type"] == "edit":
        txn_id = proposal.get("original_transaction_id")
        if not txn_id:
            raise HTTPException(400, "Edit proposal missing original transaction id")
        existing = db.get_transaction_by_id(txn_id)
        if not existing:
            raise HTTPException(404, "Original transaction not found")
        raw_date = (proposal.get("date") or existing["date"] or "")[:10]
        updates = {
            "amount": proposal["amount"] if proposal["amount"] is not None else existing["amount"],
            "description": proposal["description"] or existing["description"],
            "owner": proposal["owner"] or existing["owner"],
            "date": raw_date,
            "tags": proposal.get("tags") or existing.get("tags", []),
        }
        db.update_transaction(txn_id, updates)
        db.update_transaction_proposal_status(proposal_id, "approved")
        return {"ok": True, "applied": {"id": txn_id, **updates}}

    raise HTTPException(400, "Unsupported proposal type")


@router.post("/transaction-proposals/{proposal_id}/reject")
async def reject_transaction_proposal(proposal_id: int):
    proposal = db.get_transaction_proposal_by_id(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] != "pending":
        raise HTTPException(400, "Proposal already processed")
    db.update_transaction_proposal_status(proposal_id, "rejected")
    return {"ok": True}


@router.patch("/transaction-proposals/{proposal_id}")
async def update_transaction_proposal(proposal_id: int, body: dict):
    proposal = db.get_transaction_proposal_by_id(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] != "pending":
        raise HTTPException(400, "Only pending proposals can be edited")

    allowed = {"amount", "description", "owner", "date", "tags"}
    filtered = {k: v for k, v in body.items() if k in allowed}
    if not filtered:
        raise HTTPException(400, "No valid fields to update")
    db.update_transaction_proposal(proposal_id, filtered)
    updated = db.get_transaction_proposal_by_id(proposal_id)
    return {"ok": True, "proposal": updated}


@router.patch("/transactions/{txn_id}")
async def update_transaction(txn_id: int, body: dict):
    existing = db.get_transaction_by_id(txn_id)
    if not existing:
        raise HTTPException(404, "Transaction not found")
    allowed = {"amount", "description", "category", "tags", "owner", "date"}
    filtered = {k: v for k, v in body.items() if k in allowed}
    if not filtered:
        raise HTTPException(400, "No valid fields to update")
    if "date" in filtered and filtered["date"]:
        filtered["date"] = str(filtered["date"])[:10]
    db.update_transaction(txn_id, filtered, save_history=True)
    updated = db.get_transaction_by_id(txn_id)
    return {"ok": True, "transaction": updated}


@router.get("/transactions/{txn_id}/history")
async def get_transaction_history(txn_id: int):
    return db.get_transaction_edit_history(txn_id)


@router.post("/transactions/{txn_id}/revert/{edit_id}")
async def revert_transaction(txn_id: int, edit_id: int):
    ok = db.revert_transaction(txn_id, edit_id)
    if not ok:
        raise HTTPException(404, "Edit snapshot not found")
    updated = db.get_transaction_by_id(txn_id)
    return {"ok": True, "transaction": updated}


@router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: int):
    ok = db.delete_transaction(txn_id)
    if not ok:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@router.post("/transactions/{txn_id}/flag")
async def flag_transaction(txn_id: int):
    existing = db.get_transaction_by_id(txn_id)
    if not existing:
        raise HTTPException(404, "Transaction not found")
    tags = existing.get("tags", [])
    if "flagged" not in tags:
        tags.append("flagged")
        db.update_transaction(txn_id, {"tags": tags}, save_history=False)
    return {"ok": True, "tags": tags}


@router.get("/transactions/{txn_id}/explain")
async def explain_transaction(txn_id: int, request: Request):
    orchestrator = request.app.state.orchestrator
    return await orchestrator.explain_transaction(txn_id)


# ---- goals ----

@router.get("/goals")
async def get_goals(status: str | None = None):
    return db.get_goals(status=status)


@router.post("/goals")
async def create_goal(goal: Goal):
    goal_id = db.insert_goal(goal.model_dump(mode="json"))
    return {"id": goal_id, **goal.model_dump()}


@router.patch("/goals/{goal_id}")
async def update_goal(goal_id: int, updates: dict):
    allowed = {"current_amount", "status", "priority", "summary", "name", "icon"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        raise HTTPException(400, "No valid fields to update")
    db.update_goal(goal_id, filtered)
    return {"ok": True}


# ---- ai sweep ----

@router.post("/ai-sweep")
async def run_ai_sweep(request: Request):
    orchestrator = request.app.state.orchestrator
    recommendations = await orchestrator.run_ai_sweep()
    return {"recommendations": recommendations}


# ---- recommendations ----

@router.get("/recommendations")
async def get_recommendations(status: str | None = None):
    return db.get_recommendations(status=status)


@router.post("/recommendations/{rec_id}/accept")
async def accept_recommendation(rec_id: int):
    db.update_recommendation(rec_id, "accepted")
    return {"status": "accepted"}


@router.post("/recommendations/{rec_id}/reject")
async def reject_recommendation(rec_id: int):
    db.update_recommendation(rec_id, "rejected")
    return {"status": "rejected"}


@router.post("/recommendations/{rec_id}/pin")
async def pin_recommendation(rec_id: int, body: dict):
    pinned = body.get("pinned", True)
    db.pin_recommendation(rec_id, pinned)
    return {"pinned": pinned}


# ---- feedback ----

class FeedbackRequest(BaseModel):
    action: str
    tags: list[str] = []
    comment: str = ""


@router.post("/recommendations/{rec_id}/feedback")
async def submit_feedback(rec_id: int, body: FeedbackRequest):
    fid = db.insert_feedback(rec_id, body.action, body.tags, body.comment)

    if body.tags:
        prefs = db.get_preferences()
        existing = prefs.get("feedback_tags", "")
        tag_str = ", ".join(body.tags)
        new_val = f"{existing}; {body.action}: {tag_str}" if existing else f"{body.action}: {tag_str}"
        db.upsert_preference("feedback_tags", new_val[-500:])

    return {"id": fid}


@router.get("/recommendations/{rec_id}/feedback")
async def get_feedback(rec_id: int):
    return db.get_feedback(rec_id)


@router.post("/recommendations/{rec_id}/feedback-options")
async def generate_feedback_options(rec_id: int, body: dict, request: Request):
    action = body.get("action", "accept")
    recs = db.get_recommendations()
    rec = next((r for r in recs if r["id"] == rec_id), None)
    if not rec:
        raise HTTPException(404, "Recommendation not found")
    orchestrator = request.app.state.orchestrator
    options = orchestrator.advisor.generate_feedback_options(rec, action)
    return {"options": options}


# ---- chat ----

class ChatRequest(BaseModel):
    message: str


@router.post("/recommendations/{rec_id}/chat")
async def chat_about_recommendation(rec_id: int, body: ChatRequest, request: Request):
    recs = db.get_recommendations()
    rec = next((r for r in recs if r["id"] == rec_id), None)
    if not rec:
        raise HTTPException(404, "Recommendation not found")

    db.insert_chat_message(rec_id, "user", body.message)

    history = db.get_chat_messages(rec_id)
    preferences = db.get_preferences()
    orchestrator = request.app.state.orchestrator
    reply = orchestrator.advisor.chat_about_recommendation(rec, body.message, history, preferences)

    db.insert_chat_message(rec_id, "assistant", reply)

    if any(kw in body.message.lower() for kw in ["i prefer", "we prefer", "don't cancel", "keep", "i like", "we like", "important to"]):
        pref_key = f"chat_pref_{rec_id}"
        db.upsert_preference(pref_key, body.message[:300])

    return {"reply": reply}


@router.get("/recommendations/{rec_id}/chat")
async def get_chat_history(rec_id: int):
    return db.get_chat_messages(rec_id)


# ---- preferences ----

@router.get("/preferences")
async def get_preferences():
    prefs = db.get_preferences()
    feedback = db.get_feedback()
    return {"preferences": prefs, "feedback_history": feedback[:20]}


@router.delete("/preferences/{key}")
async def delete_preference(key: str):
    db.delete_preference(key)
    return {"ok": True}


@router.put("/preferences/{key}")
async def update_preference(key: str, body: dict):
    value = body.get("value", "")
    if not value:
        raise HTTPException(400, "Value required")
    db.upsert_preference(key, value)
    return {"ok": True}


@router.delete("/feedback/{feedback_id}")
async def delete_feedback_entry(feedback_id: int):
    db.delete_feedback(feedback_id)
    return {"ok": True}


@router.post("/preferences/generate-profile")
async def generate_ai_profile(request: Request):
    """Use the AI to read all feedback and preferences and generate a human-readable user profile."""
    prefs = db.get_preferences()
    feedback_summary = db.get_all_feedback_summary()

    orchestrator = request.app.state.orchestrator
    prompt = f"""Based on this user's feedback history and saved preferences, generate a concise "User Profile" as short bullet points.

Preferences stored:
{chr(10).join(f'- {k}: {v}' for k, v in prefs.items()) if prefs else 'None yet.'}

Feedback history:
{feedback_summary}

Rules:
- Return exactly 4-6 bullets.
- Each bullet max 8 words.
- Be concrete and practical.
- No intro sentence, no markdown header, no JSON.

Return only plain bullet lines starting with "- "."""

    response = orchestrator.client.chat.completions.create(
        model="gpt-4o",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    profile_text = response.choices[0].message.content.strip()

    db.upsert_preference("ai_profile", profile_text)

    return {"profile": profile_text}


# ---- natural language command ----

@router.post("/command")
async def process_command(cmd: CommandRequest, request: Request):
    orchestrator = request.app.state.orchestrator
    result = await orchestrator.process_nl_command(cmd.text)
    return result


# ---- dashboard (generative UI) ----


@router.get("/dashboard/state")
async def get_dashboard_state():
    state = db.get_dashboard_state()
    if not state:
        return {"html": None, "chat_history": []}
    return {"html": state["html_content"], "chat_history": state["chat_history"]}


class DashboardPlanRequest(BaseModel):
    message: str = ""


@router.post("/dashboard/plan")
async def dashboard_plan(body: DashboardPlanRequest, request: Request):
    """Step 1: AI proposes a list of widgets based on the household data."""
    import json as _json
    orchestrator = request.app.state.orchestrator
    stats = db.get_transaction_stats()
    goals = db.get_goals()
    recs = db.get_recommendations()

    by_cat = ", ".join(f"{k}: ${v:,.2f}" for k, v in list(stats.get("by_category", {}).items())[:8])
    by_owner = ", ".join(f"{k}: ${v:,.2f}" for k, v in stats.get("by_owner", {}).items())
    by_month = ", ".join(f"{k}: ${v:,.2f}" for k, v in list(stats.get("by_month", {}).items())[-6:])

    goal_text = ", ".join(f"{g['icon']} {g['name']} (${g['current_amount']:,.0f}/${g['target_amount']:,.0f})" for g in goals) or "None"
    rec_text = ", ".join(f"{r['title']}" for r in recs[:5]) or "None"

    user_msg = body.message.strip() or "Suggest a balanced default overview for the whole household."

    prompt = f"""You are a financial dashboard planner for a family finance app.

HOUSEHOLD DATA:
- {stats['count']} transactions totaling ${stats['total']:,.2f}
- Categories: {by_cat}
- Owners: {by_owner}
- Monthly spending: {by_month}
- Goals: {goal_text}
- AI Recommendations: {rec_text}

USER REQUEST: "{user_msg}"

Based on this data, propose 3-5 dashboard widgets that would be most useful for the entire household, not just a single bill or tiny slice of data.
Start from a general overview: overall spending, category breakdowns, trends over time, goal progress, and comparisons between family members. Only then add any deeper dives if they clearly help the whole family.
The user may also request novel/custom widgets like a "GitHub-style no-spend streak tracker", "daily spending heatmap", "family leaderboard", etc. — support any creative idea they describe, but keep the perspective household-wide.

For each widget, provide:
- id: a short snake_case identifier
- title: display title with an emoji
- description: one sentence explaining what it shows and why it's useful
- type: one of "stat_card", "donut_chart", "bar_chart", "line_chart", "progress_bars", "table", "alert_card", "heatmap", "streak_tracker", "custom"

Return ONLY a JSON array. No markdown fences, no explanation:
[{{"id": "...", "title": "...", "description": "...", "type": "..."}}]"""

    response = orchestrator.client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.5,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        widgets = _json.loads(raw)
    except Exception:
        widgets = [
            {"id": "total_spend", "title": "💰 Total Spending", "description": "Summary stat cards with total, average, and transaction count.", "type": "stat_card"},
            {"id": "category_breakdown", "title": "📊 Spending by Category", "description": "Donut chart showing how spending breaks down by category.", "type": "donut_chart"},
            {"id": "monthly_trend", "title": "📈 Monthly Trend", "description": "Line chart showing spending over recent months.", "type": "line_chart"},
            {"id": "goal_progress", "title": "🎯 Goal Progress", "description": "Progress bars for each family savings goal.", "type": "progress_bars"},
            {"id": "owner_comparison", "title": "👥 By Family Member", "description": "Bar chart comparing spending across family members.", "type": "bar_chart"},
        ]

    return {"widgets": widgets}


@router.get("/dashboard/suggestions")
async def dashboard_suggestions(request: Request):
    """Generate dynamic prompt suggestions based on current data."""
    import json as _json
    orchestrator = request.app.state.orchestrator
    stats = db.get_transaction_stats()
    goals = db.get_goals()

    if stats["count"] == 0:
        return {"suggestions": [
            "Build me an overview of our finances",
            "Show spending trends and goal progress",
        ]}

    prompt = f"""Based on this household's financial data, generate exactly 4 SHORT suggested dashboard prompts a user could request.
Data: {stats['count']} transactions totaling ${stats['total']:,.2f}. Categories: {', '.join(list(stats.get('by_category', {}).keys())[:6])}. Owners: {', '.join(stats.get('by_owner', {}).keys())}. {len(goals)} goals.

Rules:
- Each 5-10 words. Be specific to THIS household's data (reference actual categories, owners, goals by name).
- Mix: overviews, deep-dives, comparisons, creative ideas (streak trackers, heatmaps, leaderboards).
- Return ONLY a JSON array of strings. No markdown."""

    response = orchestrator.client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
    )
    raw = response.choices[0].message.content.strip()
    try:
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        suggestions = _json.loads(raw)
    except Exception:
        suggestions = [
            "Build me an overview of our finances",
            "Show spending trends and goal progress",
            "Compare spending across family members",
            "Highlight where we can save money",
        ]
    return {"suggestions": suggestions}


@router.delete("/dashboard/state")
async def clear_dashboard():
    """Clear the persisted dashboard."""
    db.save_dashboard_state("", [])
    return {"ok": True}


class DashboardBuildRequest(BaseModel):
    widgets: list[dict]
    message: str = ""


@router.post("/dashboard/build")
async def dashboard_build(body: DashboardBuildRequest, request: Request):
    """Step 2: Stream-generate HTML for approved widgets via SSE."""
    import json as _json, time as _time, logging
    _log = logging.getLogger("dashboard")

    orchestrator = request.app.state.orchestrator
    stats = db.get_transaction_stats()
    goals = db.get_goals()

    by_tag_dict = stats.get("by_tag", {}) or {}

    data_json = _json.dumps({
        "transactions": stats.get("transactions", [])[:30],
        "goals": goals,
        "stats": {
            "count": stats["count"],
            "total": stats["total"],
            "by_category": stats.get("by_category", {}),
            "by_owner": stats.get("by_owner", {}),
            "by_month": stats.get("by_month", {}),
            "by_tag": by_tag_dict,
        },
    }, default=str)

    widget_list = "\n".join(
        f"  {i+1}. [{w['type']}] {w['title']}: {w['description']}"
        for i, w in enumerate(body.widgets)
    )

    system_prompt = f"""You build a compact financial dashboard as a single HTML page rendered in an iframe.

WIDGETS TO BUILD (only these, no extras):
{widget_list}

Return ONLY raw HTML starting with <!DOCTYPE html>. NEVER wrap in markdown fences.
Put <style> in <head>, body content next, <script> at END of body.

MANDATORY JS CONTRACT (at END of <body>):
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
window.DATA = {data_json};
var chartInstances = {{}};
window.refresh = function() {{ renderDashboard(); }};
window.addEventListener("message", function(e) {{
  if (e.data && e.data.type === "DATA_UPDATE") {{ window.DATA = e.data.payload; window.refresh(); }}
}});
function renderDashboard() {{
  Object.values(chartInstances).forEach(function(c) {{ c.destroy(); }});
  chartInstances = {{}};
  // rebuild all from window.DATA
}}
document.addEventListener("DOMContentLoaded", renderDashboard);
</script>

─── DESIGN SYSTEM (match the parent app exactly) ───
Font: font-family: 'Nunito', system-ui, -apple-system, sans-serif;
Page: background: transparent; margin:0; padding:12px; box-sizing:border-box;
Cards: background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px;
Layout: CSS grid with grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px;
Sizing: Do NOT cap total height. Do NOT use overflow:hidden on body/html. Allow the dashboard to grow naturally.
Body: min-height: 100%; overflow: visible.

Text sizes (follow exactly):
- Section title: 13px, font-weight:600, color:#737373, text-transform:uppercase, letter-spacing:0.05em
- Card title: 13px, font-weight:600, color:#262626
- Large values: 22px, font-weight:700, color:#4338ca (indigo-700)
- Small labels: 11px, color:#a3a3a3
- Body text: 13px, color:#525252

Colors (use these exact values):
- Emerald: #10b981 (primary positive)
- Sky: #3b82f6 (info/links)
- Amber: #f59e0b (warning)
- Rose: #ef4444 (negative/alert)
- Violet: #8b5cf6 (accent)
- Indigo: #4338ca (monetary values)
- Borders: #e2e8f0
- Subtle bg: #f8fafc
- Muted text: #a3a3a3

Pills/tags: display:inline-flex; border-radius:9999px; padding:2px 10px; font-size:11px; font-weight:500;
  Category pills: background:#e0f2fe; color:#0369a1;
  Owner pills: background:#ede9fe; color:#6d28d9;
  Tag pills: background:#d1fae5; color:#047857;

Progress bars: height:6px; border-radius:9999px; background:#e2e8f0;
  Fill: background: linear-gradient(to right, #10b981, #38bdf8); border-radius:9999px;

Charts (Chart.js 4 config):
- font.size:11, font.family:'Nunito, system-ui'
- No chart title (plugins.title.display=false)
- Grid: color '#f1f5f9', drawBorder:false
- Legend: position:'bottom', labels.font.size:10, labels.boxWidth:8, labels.padding:8
- responsive:true
- interaction: mode:'index', intersect:false
- Tooltips: enabled:true with callbacks to format $ values; tooltip title fontSize 12 weight 600; body fontSize 12; backgroundColor 'rgba(0,0,0,0.8)'; padding 10; cornerRadius 8
- Doughnut: cutout:'65%', spacing:2, borderWidth:0
- Doughnut: hoverOffset: 8
- Bar: borderRadius:4, borderSkipped:false, barPercentage:0.75
- Line: tension:0.35, borderWidth:2, pointRadius:3, pointHoverRadius:6, pointBackgroundColor '#ffffff', pointBorderWidth 2, fill:true with alpha 0.1
- Interactivity: set canvas cursor to pointer on hover; enable animations duration 600 easing 'easeOutQuart'
- Animation: animation.duration=600, animation.easing='easeOutQuart'
- Hover: onHover set cursor='pointer' when active elements exist
- Aspect ratio: use maintainAspectRatio:false and a fixed-height container so charts fill the space. (Fallback: aspectRatio: 1.8)

Stat cards: aim for ~56px height (don’t hard-code). Use a flex row, align-items:center, gap:8px.
Chart containers: height:200px, padding:12px, background:#f8fafc, border-radius:8px, position:relative. The <canvas> must be display:block; width:100%; height:100%.

Hover effects on cards: transition: transform 0.15s, box-shadow 0.15s;
  :hover {{ transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.06); }}

For creative/custom widgets (streak trackers, heatmaps, leaderboards, etc.), implement with pure HTML/CSS/JS using the same design system. CSS grids for heatmaps, styled divs for streaks, progress bars for leaderboards."""

    # Encourage a playful but appropriate visual style without breaking consistency
    system_prompt += """

VISUAL TONE:
- The dashboard should feel friendly and approachable, like the rest of FamilyOps: rounded cards, soft shadows, generous padding.
- Use fun but appropriate colors within the palette above (no neon). It should feel warm and family-friendly, not corporate or sterile.
- Use emojis and small icons in card titles where it helps readability and delight."""

    user_content = body.message.strip() or "Build the dashboard with the approved widgets."

    _log.info("🔨 Streaming dashboard build with %d widgets...", len(body.widgets))
    t0 = _time.time()

    def generate():
        full = ""
        try:
            stream = orchestrator.client.chat.completions.create(
                model="gpt-5-nano",
                max_completion_tokens=16000,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full += delta
                    yield f"data: {_json.dumps({'t': delta})}\n\n"
        except Exception as exc:
            _log.error("Stream error: %s", exc)
            yield f"data: {_json.dumps({'error': str(exc)})}\n\n"
            return

        elapsed = _time.time() - t0
        _log.info("✅ Stream done in %.1fs (%d chars)", elapsed, len(full))

        raw = full.strip()
        if raw.startswith("```"):
            first_nl = raw.find("\n")
            if first_nl != -1:
                raw = raw[first_nl + 1:]
            if raw.endswith("```"):
                raw = raw[:-3].rstrip()
        if not raw.startswith("<!"):
            idx = raw.find("<!DOCTYPE")
            if idx == -1:
                idx = raw.find("<html")
            if idx != -1:
                raw = raw[idx:]

        db.save_dashboard_state(raw, [])
        yield f"data: {_json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ---- playground ----

class PlaygroundChatRequest(BaseModel):
    message: str
    history: list[dict] = []


@router.post("/playground/chat")
async def playground_chat(body: PlaygroundChatRequest, request: Request):
    orchestrator = request.app.state.orchestrator
    stats = db.get_transaction_stats()
    goals = db.get_goals()

    goal_text = "\n".join(
        f"- {g['icon']} {g['name']}: ${g['current_amount']:,.0f} / ${g['target_amount']:,.0f} by {g['deadline']}"
        for g in goals
    ) or "No goals set."

    txn_sample = ""
    for t in stats.get("transactions", [])[:30]:
        txn_sample += f"  {t['date'][:10]} | {t['description']} | ${t['amount']:.2f} | {t['owner']} | {t.get('category','?')} | tags:{t.get('tags',[])}\n"

    by_tag = stats.get("by_tag", {}) or {}
    tag_summary = ', '.join(f'{k}: ${v:,.2f}' for k, v in list(by_tag.items())[:10]) if by_tag else "None"

    system_prompt = f"""You are a financial data analyst chatbot for FamilyOps.
You have access to this household's complete financial data:

SUMMARY:
- {stats['count']} transactions totaling ${stats['total']:,.2f}
- Spending by category: {', '.join(f'{k}: ${v:,.2f}' for k,v in list(stats['by_category'].items())[:10])}
- Spending by owner: {', '.join(f'{k}: ${v:,.2f}' for k,v in stats['by_owner'].items())}
- Spending by month: {', '.join(f'{k}: ${v:,.2f}' for k,v in list(stats['by_month'].items())[-6:])}
- Top tags: {tag_summary}

GOALS:
{goal_text}

RECENT TRANSACTIONS (sample):
{txn_sample}

INSTRUCTIONS:
When the user asks a question, respond with a JSON object with these fields:
- "text": Your natural language analysis (2-3 sentences, clear and helpful). Keep it short — the chart does the talking.
- "chart": A chart visualization. You MUST include a chart with EVERY response. Always pick the most relevant chart type:
  - "pie": for breakdowns/proportions (category splits, owner shares)
  - "bar": for comparisons across categories or entities
  - "line": for trends over time (monthly, weekly patterns)
  - "area": for cumulative or stacked trends over time
  Structure:
  {{
    "type": "bar" | "line" | "pie" | "area",
    "title": "Chart title",
    "data": [{{ "name": "Label", "value": 123 }}, ...],
    "colors": ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]
  }}

For multi-series charts (comparing things over time), data items can have multiple value keys:
  {{ "name": "Jan", "food": 200, "transport": 150 }}
  And set "yKeys": ["food", "transport"]

Chart selection guidance:
- "What do I spend most on?" → pie chart of categories
- "How has spending changed?" → line chart by month
- "Compare family members" → bar chart by owner
- "Show me food spending over time" → area chart by month
- "Top 5 biggest expenses" → bar chart of top transactions
- Even for yes/no questions, include a supporting chart for context.

Rules:
- ALWAYS include a chart. Every response must have a visualization.
- Always compute numbers accurately from the data above.
- Use the ACTUAL data, never make up numbers.
- Keep "text" concise — let the chart speak.
- For pie charts, include percentage breakdowns in the text.
- Return ONLY the JSON object, no markdown fences, no extra text."""

    messages = [{"role": "system", "content": system_prompt}]
    for msg in (body.history or [])[-8:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": body.message})

    import json as _json
    response = orchestrator.client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1500,
        messages=messages,
        temperature=0.3,
    )
    raw = response.choices[0].message.content.strip()

    try:
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        parsed = _json.loads(raw)
    except Exception:
        parsed = {"text": raw, "chart": None}

    return parsed


@router.get("/playground/suggestions")
async def playground_suggestions(request: Request):
    orchestrator = request.app.state.orchestrator
    stats = db.get_transaction_stats()
    goals = db.get_goals()

    if stats["count"] == 0:
        return {"suggestions": [
            "Show me a breakdown of my spending",
            "What are my top expense categories?",
            "How is my spending trending over time?",
        ]}

    prompt = f"""Based on this household's financial data, generate exactly 6 short suggested prompts a user could ask to explore their data.
The data has:
- {stats['count']} transactions totaling ${stats['total']:,.2f}
- Categories: {', '.join(list(stats['by_category'].keys())[:8])}
- Owners: {', '.join(stats['by_owner'].keys())}
- {len(goals)} active goals: {', '.join(g['name'] for g in goals[:4])}

Rules:
- Each prompt should be 5-12 words.
- Mix: spending breakdowns, trends over time, comparisons between owners, goal progress, anomalies.
- Return ONLY a JSON array of strings. No markdown."""

    response = orchestrator.client.chat.completions.create(
        model="gpt-4o",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    raw = response.choices[0].message.content.strip()

    import json as _json
    try:
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        suggestions = _json.loads(raw)
    except Exception:
        suggestions = [
            "Show my spending by category as a pie chart",
            "Compare spending between family members",
            "How has spending changed month over month?",
            "Which categories grew the most recently?",
            "Am I on track for my savings goals?",
            "What are my biggest recurring expenses?",
        ]

    return {"suggestions": suggestions}


# ---- RAG search ----

@router.get("/search")
async def search_memory(q: str, type: str | None = None, request: Request = None):
    rag = request.app.state.rag
    return rag.search_similar(q, n_results=10, filter_type=type)
