import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from ..rag.vector_store import RAGStore
from ..agents.orchestrator import AgentOrchestrator
from ..db.database import init_db

app = FastAPI(title="FamilyOps API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag_store = RAGStore()
orchestrator = AgentOrchestrator(rag_store)

app.state.rag = rag_store
app.state.orchestrator = orchestrator

app.include_router(router)


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/health")
async def health():
    return {"status": "ok"}
