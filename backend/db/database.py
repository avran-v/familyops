import sqlite3
import json
import os
from datetime import datetime
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "finance.db")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            amount      REAL NOT NULL,
            description TEXT NOT NULL,
            category    TEXT,
            tags        TEXT DEFAULT '[]',
            owner       TEXT NOT NULL,
            date        TEXT NOT NULL,
            ai_confidence REAL,
            ai_reasoning  TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS transaction_proposals (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            proposal_type TEXT NOT NULL, -- add | edit
            status      TEXT DEFAULT 'pending', -- pending | approved | rejected
            original_transaction_id INTEGER,
            amount      REAL,
            description TEXT,
            owner       TEXT,
            date        TEXT,
            tags        TEXT DEFAULT '[]',
            command_text TEXT,
            source      TEXT DEFAULT 'command_palette',
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (original_transaction_id) REFERENCES transactions(id)
        );

        CREATE TABLE IF NOT EXISTS goals (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL,
            icon           TEXT DEFAULT '🎯',
            target_amount  REAL NOT NULL,
            current_amount REAL DEFAULT 0,
            deadline       TEXT NOT NULL,
            priority       TEXT DEFAULT 'medium',
            status         TEXT DEFAULT 'active',
            summary        TEXT,
            created_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS recommendations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            type        TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT NOT NULL,
            reasoning   TEXT NOT NULL,
            confidence  TEXT DEFAULT 'medium',
            action_data TEXT DEFAULT '{}',
            status      TEXT DEFAULT 'pending',
            pinned      INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS recommendation_feedback (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            rec_id      INTEGER NOT NULL,
            action      TEXT NOT NULL,
            tags        TEXT DEFAULT '[]',
            comment     TEXT DEFAULT '',
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (rec_id) REFERENCES recommendations(id)
        );

        CREATE TABLE IF NOT EXISTS recommendation_chat (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            rec_id      INTEGER NOT NULL,
            role        TEXT NOT NULL,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (rec_id) REFERENCES recommendations(id)
        );

        CREATE TABLE IF NOT EXISTS user_preferences (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            key         TEXT NOT NULL UNIQUE,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT (datetime('now'))
        );
    """)
    # Light migrations for existing local DBs.
    existing_cols = {
        r["name"] for r in conn.execute("PRAGMA table_info(transaction_proposals)").fetchall()
    }
    if "tags" not in existing_cols:
        conn.execute("ALTER TABLE transaction_proposals ADD COLUMN tags TEXT DEFAULT '[]'")
    conn.commit()
    conn.close()


# --------------- transactions ---------------

def insert_transaction(txn: dict) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO transactions (amount, description, category, tags, owner, date, ai_confidence, ai_reasoning) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            txn["amount"],
            txn["description"],
            txn.get("category"),
            json.dumps(txn.get("tags", [])),
            txn["owner"],
            txn["date"],
            txn.get("ai_confidence"),
            txn.get("ai_reasoning"),
        ),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_transactions(owner: Optional[str] = None, limit: int = 200) -> list[dict]:
    conn = get_conn()
    if owner:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE owner = ? ORDER BY date DESC LIMIT ?",
            (owner, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM transactions ORDER BY date DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return [_row_to_txn(r) for r in rows]


def get_transaction_by_id(txn_id: int) -> Optional[dict]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    conn.close()
    return _row_to_txn(row) if row else None


def update_transaction(txn_id: int, updates: dict):
    if not updates:
        return
    conn = get_conn()
    sets = ", ".join(f"{k} = ?" for k in updates)
    vals = list(updates.values()) + [txn_id]
    conn.execute(f"UPDATE transactions SET {sets} WHERE id = ?", vals)
    conn.commit()
    conn.close()


def _row_to_txn(row) -> dict:
    d = dict(row)
    d["tags"] = json.loads(d.get("tags") or "[]")
    return d


# --------------- transaction proposals ---------------

def insert_transaction_proposal(proposal: dict) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO transaction_proposals "
        "(proposal_type, status, original_transaction_id, amount, description, owner, date, tags, command_text, source) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            proposal["proposal_type"],
            proposal.get("status", "pending"),
            proposal.get("original_transaction_id"),
            proposal.get("amount"),
            proposal.get("description"),
            proposal.get("owner"),
            proposal.get("date"),
            json.dumps(proposal.get("tags", [])),
            proposal.get("command_text", ""),
            proposal.get("source", "command_palette"),
        ),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_transaction_proposals(status: str = "pending", limit: int = 100) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM transaction_proposals WHERE status = ? ORDER BY created_at DESC LIMIT ?",
        (status, limit),
    ).fetchall()
    conn.close()
    results = []
    for row in rows:
        d = dict(row)
        d["tags"] = json.loads(d.get("tags") or "[]")
        results.append(d)
    return results


def get_transaction_proposal_by_id(proposal_id: int) -> Optional[dict]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM transaction_proposals WHERE id = ?", (proposal_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["tags"] = json.loads(d.get("tags") or "[]")
    return d


def update_transaction_proposal_status(proposal_id: int, status: str):
    conn = get_conn()
    conn.execute("UPDATE transaction_proposals SET status = ? WHERE id = ?", (status, proposal_id))
    conn.commit()
    conn.close()


def update_transaction_proposal(proposal_id: int, updates: dict):
    if not updates:
        return
    safe = dict(updates)
    if "tags" in safe and isinstance(safe["tags"], list):
        safe["tags"] = json.dumps(safe["tags"])
    conn = get_conn()
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [proposal_id]
    conn.execute(f"UPDATE transaction_proposals SET {sets} WHERE id = ?", vals)
    conn.commit()
    conn.close()


# --------------- goals ---------------

def insert_goal(goal: dict) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO goals (name, icon, target_amount, current_amount, deadline, priority, status, summary) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            goal["name"],
            goal.get("icon", "🎯"),
            goal["target_amount"],
            goal.get("current_amount", 0),
            goal["deadline"],
            goal.get("priority", "medium"),
            goal.get("status", "active"),
            goal.get("summary"),
        ),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_goals(status: Optional[str] = None) -> list[dict]:
    conn = get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM goals WHERE status = ? ORDER BY priority, deadline", (status,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM goals ORDER BY priority, deadline").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_goal(goal_id: int, updates: dict):
    conn = get_conn()
    sets = ", ".join(f"{k} = ?" for k in updates)
    vals = list(updates.values()) + [goal_id]
    conn.execute(f"UPDATE goals SET {sets} WHERE id = ?", vals)
    conn.commit()
    conn.close()


# --------------- recommendations ---------------

def insert_recommendation(rec: dict) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO recommendations (type, title, description, reasoning, confidence, action_data, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            rec["type"],
            rec["title"],
            rec["description"],
            rec["reasoning"],
            rec.get("confidence", "medium"),
            json.dumps(rec.get("action_data", {})),
            rec.get("status", "pending"),
        ),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_recommendations(status: Optional[str] = None) -> list[dict]:
    conn = get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM recommendations WHERE status = ? ORDER BY pinned DESC, created_at DESC",
            (status,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM recommendations ORDER BY pinned DESC, created_at DESC"
        ).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d["action_data"] = json.loads(d.get("action_data") or "{}")
        d["pinned"] = bool(d.get("pinned", 0))
        results.append(d)
    return results


def update_recommendation(rec_id: int, status: str):
    conn = get_conn()
    conn.execute("UPDATE recommendations SET status = ? WHERE id = ?", (status, rec_id))
    conn.commit()
    conn.close()


def pin_recommendation(rec_id: int, pinned: bool):
    conn = get_conn()
    conn.execute("UPDATE recommendations SET pinned = ? WHERE id = ?", (1 if pinned else 0, rec_id))
    conn.commit()
    conn.close()


def insert_recommendation_with_date(rec: dict, created_at: str) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO recommendations (type, title, description, reasoning, confidence, action_data, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            rec["type"],
            rec["title"],
            rec["description"],
            rec["reasoning"],
            rec.get("confidence", "medium"),
            json.dumps(rec.get("action_data", {})),
            rec.get("status", "pending"),
            created_at,
        ),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


# --------------- feedback ---------------

def insert_feedback(rec_id: int, action: str, tags: list[str], comment: str = "") -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO recommendation_feedback (rec_id, action, tags, comment) VALUES (?, ?, ?, ?)",
        (rec_id, action, json.dumps(tags), comment),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_feedback(rec_id: Optional[int] = None) -> list[dict]:
    conn = get_conn()
    if rec_id:
        rows = conn.execute("SELECT * FROM recommendation_feedback WHERE rec_id = ? ORDER BY created_at DESC", (rec_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM recommendation_feedback ORDER BY created_at DESC").fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.get("tags") or "[]")
        results.append(d)
    return results


# --------------- chat ---------------

def insert_chat_message(rec_id: int, role: str, content: str) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO recommendation_chat (rec_id, role, content) VALUES (?, ?, ?)",
        (rec_id, role, content),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_chat_messages(rec_id: int) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM recommendation_chat WHERE rec_id = ? ORDER BY created_at ASC", (rec_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --------------- preferences ---------------

def upsert_preference(key: str, value: str):
    conn = get_conn()
    conn.execute(
        "INSERT INTO user_preferences (key, value, updated_at) VALUES (?, ?, datetime('now')) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (key, value),
    )
    conn.commit()
    conn.close()


def get_preferences() -> dict[str, str]:
    conn = get_conn()
    rows = conn.execute("SELECT key, value FROM user_preferences").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def delete_preference(key: str):
    conn = get_conn()
    conn.execute("DELETE FROM user_preferences WHERE key = ?", (key,))
    conn.commit()
    conn.close()


def delete_feedback(feedback_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM recommendation_feedback WHERE id = ?", (feedback_id,))
    conn.commit()
    conn.close()


def get_all_feedback_summary() -> str:
    """Build a text summary of all user feedback for AI context."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT f.action, f.tags, f.comment, r.title, r.type "
        "FROM recommendation_feedback f JOIN recommendations r ON f.rec_id = r.id "
        "ORDER BY f.created_at DESC LIMIT 30"
    ).fetchall()
    conn.close()
    if not rows:
        return "No user feedback yet."
    lines = []
    for r in rows:
        d = dict(r)
        tags = json.loads(d.get("tags") or "[]")
        lines.append(f"- {d['action'].upper()} \"{d['title']}\" ({d['type']}): tags={tags}, comment=\"{d['comment']}\"")
    return "\n".join(lines)
