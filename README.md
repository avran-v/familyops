# FamilyOps

FamilyOps is an AI-first household finance assistant.
It combines transaction tracking, goal planning, recommendations, and natural-language workflows so families can make better financial decisions with human approval in the loop.

## Core Idea

Most finance apps only report what happened.
FamilyOps helps answer: **what should we do next?**

- AI classifies and tags new transactions
- AI flags anomalous spend
- AI generates actionable recommendations tied to goals
- Users approve/reject drafts and recommendations (human control)
- AI generates a live dashboard and ad-hoc analysis charts

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- Recharts (data visualizations)

### Backend
- FastAPI + Uvicorn
- Pydantic
- SQLite (operational data)
- ChromaDB (RAG memory store)
- OpenAI API (classification, recommendations, planning, chat)
- Tavily (optional web search enrichment)

## Main Features

- Household timeline with transaction editing/history/revert
- Goals management + progress tracking
- AI Sweep for proactive recommendations
- Recommendation inbox with accept/reject/pin/feedback/chat
- Command palette (`Cmd/Ctrl + K`) for natural language actions
- AI-generated dashboard (widget planning + streamed HTML build)
- Playground for finance Q&A with chart outputs

## Quick Start

### 1) Backend
```bash
cd /Users/aneni/familyops
source backend/venv/bin/activate
uvicorn backend.api.main:app --reload --port 8000
```

### 2) Frontend
```bash
cd /Users/aneni/familyops
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

Backend health check:
```bash
curl http://localhost:8000/health
```

## Seed Demo Data

```bash
cd /Users/aneni/familyops
source backend/venv/bin/activate
python backend/seed_demo_data.py
```

## Environment

Create `backend/.env` with:

```env
OPENAI_API_KEY=your_openai_key
TAVILY_API_KEY=your_tavily_key_optional
```

## Notes

- Frontend API base is currently `http://localhost:8000/api`.
- SQLite DB path: `backend/finance.db`
- Chroma storage path: `backend/chroma_db`
