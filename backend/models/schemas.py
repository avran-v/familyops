from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class Transaction(BaseModel):
    id: Optional[int] = None
    amount: float
    description: str
    category: Optional[str] = None
    tags: List[str] = []
    owner: str
    date: datetime
    ai_confidence: Optional[float] = None
    ai_reasoning: Optional[str] = None


class Goal(BaseModel):
    id: Optional[int] = None
    name: str
    icon: str = "🎯"
    target_amount: float
    current_amount: float = 0.0
    deadline: datetime
    priority: str = "medium"
    status: str = "active"
    summary: Optional[str] = None


class Recommendation(BaseModel):
    id: Optional[int] = None
    type: str  # reallocation, alert, suggestion, goal_health
    title: str
    description: str
    reasoning: str
    confidence: str = "medium"  # high, medium, low
    action_data: dict = {}
    status: str = "pending"  # pending, accepted, rejected
    created_at: datetime = datetime.utcnow()


class CommandRequest(BaseModel):
    text: str


class CommandResult(BaseModel):
    intent: str
    parameters: dict = {}
    confidence: float = 0.0
    response_text: str = ""
    data: Optional[dict] = None
