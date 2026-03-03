"use client";

import { TopBar } from "../page";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type PlaygroundChart,
  type PlaygroundResponse,
} from "@/lib/api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

type ChatEntry = {
  id: number;
  role: "user" | "assistant";
  content: string;
  chart?: PlaygroundChart | null;
};

const DEFAULT_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

export default function PlaygroundPage() {
  const [role, setRole] = useState<"parent" | "teen" | "child">("parent");
  const [search, setSearch] = useState("");
  const [isSweepLoading, setIsSweepLoading] = useState(false);

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didLoadSuggestions = useRef(false);

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await api.playgroundSuggestions();
      setSuggestions(res.suggestions);
    } catch {
      setSuggestions([
        "Show my spending by category",
        "Compare spending between family members",
        "How has spending changed month over month?",
        "What are my biggest recurring expenses?",
        "Am I on track for my savings goals?",
        "Which categories grew the most recently?",
      ]);
    }
    setSuggestionsLoading(false);
  }, []);

  useEffect(() => {
    if (didLoadSuggestions.current) return;
    didLoadSuggestions.current = true;
    loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setInput("");

    const userEntry: ChatEntry = {
      id: Date.now(),
      role: "user",
      content: msg,
    };
    setMessages((prev) => [...prev, userEntry]);
    setSending(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res: PlaygroundResponse = await api.playgroundChat(msg, history);

      const assistantEntry: ChatEntry = {
        id: Date.now() + 1,
        role: "assistant",
        content: res.text || "Here's what I found.",
        chart: res.chart,
      };
      setMessages((prev) => [...prev, assistantEntry]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "Sorry, something went wrong. Make sure the backend is running.",
        },
      ]);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleSweep = async () => {
    setIsSweepLoading(true);
    try {
      await api.runAISweep();
    } catch { /* noop */ }
    setIsSweepLoading(false);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        activeRole={role}
        onRoleChange={setRole}
        search={search}
        onSearchChange={setSearch}
        onRunSweep={handleSweep}
        isSweepLoading={isSweepLoading}
      />

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-8 pt-4 pb-4">
        {!hasMessages ? (
          <WelcomeScreen
            suggestions={suggestions}
            suggestionsLoading={suggestionsLoading}
            onSelect={(s) => handleSend(s)}
            onRefresh={loadSuggestions}
          />
        ) : (
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-4 pb-4"
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} entry={msg} />
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3 text-sm text-neutral-400">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* input bar */}
        <div className="shrink-0 pt-2">
          {hasMessages && suggestions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestions.slice(0, 4).map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  disabled={sending}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[0.7rem] text-neutral-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleSend()
              }
              placeholder="Ask anything about your finances..."
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-200 shadow-sm"
              disabled={sending}
            />
            <button
              onClick={() => handleSend()}
              disabled={sending || !input.trim()}
              className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-40 hover:bg-neutral-800 transition-colors shadow-sm"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── welcome screen ─── */

function WelcomeScreen({
  suggestions,
  suggestionsLoading,
  onSelect,
  onRefresh,
}: {
  suggestions: string[];
  suggestionsLoading: boolean;
  onSelect: (s: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="text-center space-y-2">
        <div className="text-5xl">🔬</div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          Data Playground
        </h1>
        <p className="text-sm text-neutral-500 max-w-md">
          Chat with AI to explore your financial data. Ask questions and get
          instant visualizations — charts, breakdowns, trends, and insights.
        </p>
      </div>

      <div className="w-full max-w-lg space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Suggested prompts
          </h3>
          <button
            onClick={onRefresh}
            disabled={suggestionsLoading}
            className="text-[0.65rem] text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
          >
            {suggestionsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {suggestionsLoading ? (
          <div className="flex justify-center py-8">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSelect(s)}
                className="group rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-neutral-700 hover:border-sky-300 hover:bg-sky-50/50 transition-all shadow-sm"
              >
                <span className="text-base mr-1.5">{promptEmoji(i)}</span>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function promptEmoji(i: number) {
  const emojis = ["📊", "📈", "🥧", "💰", "🎯", "🔍", "📉", "🏷️"];
  return emojis[i % emojis.length];
}

/* ─── message bubble ─── */

function MessageBubble({ entry }: { entry: ChatEntry }) {
  const isUser = entry.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] space-y-3 ${
          isUser
            ? "rounded-2xl bg-neutral-900 text-white px-4 py-3"
            : "space-y-3"
        }`}
      >
        {isUser ? (
          <p className="text-sm">{entry.content}</p>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-line">
                {entry.content}
              </p>
            </div>
            {entry.chart && <ChartRenderer chart={entry.chart} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── chart renderer ─── */

function ChartRenderer({ chart }: { chart: PlaygroundChart }) {
  const colors = chart.colors || DEFAULT_COLORS;
  const data = chart.data || [];

  if (data.length === 0) return null;

  const yKeys =
    chart.yKeys ||
    Object.keys(data[0]).filter((k) => k !== "name" && typeof data[0][k] === "number");
  const nameKey = "name";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-neutral-800 mb-3">
        {chart.title}
      </h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={yKeys[0] || "value"}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={colors[i % colors.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `$${value.toLocaleString()}`}
              />
            </PieChart>
          ) : chart.type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey={nameKey}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
              />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip
                formatter={(value: number) => `$${value.toLocaleString()}`}
              />
              {yKeys.length > 1 && <Legend />}
              {yKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          ) : chart.type === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey={nameKey}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
              />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip
                formatter={(value: number) => `$${value.toLocaleString()}`}
              />
              {yKeys.length > 1 && <Legend />}
              {yKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[i % colors.length]}
                  fill={colors[i % colors.length]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey={nameKey}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
              />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip
                formatter={(value: number) => `$${value.toLocaleString()}`}
              />
              {yKeys.length > 1 && <Legend />}
              {yKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[i % colors.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
