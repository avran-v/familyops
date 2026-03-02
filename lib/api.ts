const API_BASE = "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export type Transaction = {
  id: number;
  amount: number;
  description: string;
  category: string | null;
  tags: string[];
  owner: string;
  date: string;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  created_at: string;
};

export type TransactionProposal = {
  id: number;
  proposal_type: "add" | "edit";
  status: "pending" | "approved" | "rejected";
  original_transaction_id: number | null;
  amount: number | null;
  description: string | null;
  owner: string | null;
  date: string | null;
  tags: string[];
  command_text: string;
  source: string;
  created_at: string;
};

export type Goal = {
  id: number;
  name: string;
  icon: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  priority: string;
  status: string;
  summary: string | null;
  created_at: string;
};

export type Alternative = {
  name: string;
  estimated_cost: number;
  notes: string;
  url?: string;
};

export type RecommendationActionData = {
  goal_affected?: string;
  amount?: number;
  monthly_savings?: number;
  related_transaction_ids?: number[];
  current_spend?: number;
  proposed_spend?: number;
  alternatives?: Alternative[];
  transaction_id?: number;
  [key: string]: unknown;
};

export type Recommendation = {
  id: number;
  type: string;
  title: string;
  description: string;
  reasoning: string;
  confidence: string;
  action_data: RecommendationActionData;
  status: string;
  pinned: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: number;
  rec_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type CommandResult = {
  intent: string;
  parameters: Record<string, unknown>;
  confidence: number;
  response_text: string;
  data?: Record<string, unknown>;
};

export const api = {
  getTransactions: (owner?: string) =>
    request<Transaction[]>(`/transactions${owner ? `?owner=${owner}` : ""}`),

  getTransactionProposals: (status: "pending" | "approved" | "rejected" = "pending") =>
    request<TransactionProposal[]>(`/transaction-proposals?status=${status}`),

  approveTransactionProposal: (id: number) =>
    request<{ ok: boolean; applied: Record<string, unknown> }>(`/transaction-proposals/${id}/approve`, {
      method: "POST",
    }),

  rejectTransactionProposal: (id: number) =>
    request<{ ok: boolean }>(`/transaction-proposals/${id}/reject`, {
      method: "POST",
    }),

  updateTransactionProposal: (
    id: number,
    updates: Partial<Pick<TransactionProposal, "amount" | "description" | "owner" | "date" | "tags">>
  ) =>
    request<{ ok: boolean; proposal: TransactionProposal }>(`/transaction-proposals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  getGoals: (status?: string) =>
    request<Goal[]>(`/goals${status ? `?status=${status}` : ""}`),

  getRecommendations: (status?: string) =>
    request<Recommendation[]>(
      `/recommendations${status ? `?status=${status}` : ""}`
    ),

  runAISweep: () =>
    request<{ recommendations: Recommendation[] }>("/ai-sweep", {
      method: "POST",
    }),

  acceptRecommendation: (id: number) =>
    request<{ status: string }>(`/recommendations/${id}/accept`, {
      method: "POST",
    }),

  rejectRecommendation: (id: number) =>
    request<{ status: string }>(`/recommendations/${id}/reject`, {
      method: "POST",
    }),

  pinRecommendation: (id: number, pinned: boolean) =>
    request<{ pinned: boolean }>(`/recommendations/${id}/pin`, {
      method: "POST",
      body: JSON.stringify({ pinned }),
    }),

  getFeedbackOptions: (id: number, action: string) =>
    request<{ options: string[] }>(`/recommendations/${id}/feedback-options`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  submitFeedback: (id: number, action: string, tags: string[], comment: string = "") =>
    request<{ id: number }>(`/recommendations/${id}/feedback`, {
      method: "POST",
      body: JSON.stringify({ action, tags, comment }),
    }),

  getChatHistory: (id: number) =>
    request<ChatMessage[]>(`/recommendations/${id}/chat`),

  sendChatMessage: (id: number, message: string) =>
    request<{ reply: string }>(`/recommendations/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  getPreferences: () =>
    request<{
      preferences: Record<string, string>;
      feedback_history: Array<{
        id: number;
        rec_id: number;
        action: string;
        tags: string[];
        comment: string;
        created_at: string;
      }>;
    }>("/preferences"),

  deletePreference: (key: string) =>
    request<{ ok: boolean }>(`/preferences/${encodeURIComponent(key)}`, { method: "DELETE" }),

  updatePreference: (key: string, value: string) =>
    request<{ ok: boolean }>(`/preferences/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),

  deleteFeedback: (id: number) =>
    request<{ ok: boolean }>(`/feedback/${id}`, { method: "DELETE" }),

  generateAIProfile: () =>
    request<{ profile: string }>("/preferences/generate-profile", { method: "POST" }),

  sendCommand: (text: string) =>
    request<CommandResult>("/command", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  explainTransaction: (id: number) =>
    request<Record<string, unknown>>(`/transactions/${id}/explain`),

  search: (q: string, type?: string) =>
    request<unknown[]>(`/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ""}`),
};
