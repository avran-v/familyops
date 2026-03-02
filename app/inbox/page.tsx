"use client";

import { TopBar } from "../page";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type Recommendation,
  type Transaction,
  type Alternative,
  type ChatMessage,
} from "@/lib/api";

type FilterTab = "all" | "pending" | "accepted" | "rejected";

export default function InboxPage() {
  const [role, setRole] = useState<"parent" | "teen" | "child">("parent");
  const [search, setSearch] = useState("");
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        api.getRecommendations(),
        api.getTransactions(),
      ]);
      setRecs(r);
      setTransactions(t);
    } catch {
      /* API not running */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSweep = async () => {
    setSweepLoading(true);
    try {
      const res = await api.runAISweep();
      setRecs((prev) => [...res.recommendations, ...prev]);
    } catch {
      /* noop */
    }
    setSweepLoading(false);
  };

  const handleAccept = async (id: number) => {
    try {
      await api.acceptRecommendation(id);
      setRecs((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "accepted" } : r))
      );
    } catch {
      /* noop */
    }
  };

  const handleReject = async (id: number) => {
    try {
      await api.rejectRecommendation(id);
      setRecs((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "rejected" } : r))
      );
    } catch {
      /* noop */
    }
  };

  const handlePin = async (id: number, pinned: boolean) => {
    try {
      await api.pinRecommendation(id, pinned);
      setRecs((prev) =>
        prev.map((r) => (r.id === id ? { ...r, pinned } : r))
      );
    } catch {
      /* noop */
    }
  };

  const txnMap = useMemo(() => {
    const map = new Map<number, Transaction>();
    for (const t of transactions) map.set(t.id, t);
    return map;
  }, [transactions]);

  const filteredRecs = useMemo(() => {
    let list = recs;
    if (filterTab !== "all")
      list = list.filter((r) => r.status === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q)
      );
    }
    // pinned first, then by date
    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [recs, filterTab, search]);

  const selected = filteredRecs.find((r) => r.id === selectedId) ?? null;

  const counts = useMemo(
    () => ({
      all: recs.length,
      pending: recs.filter((r) => r.status === "pending").length,
      accepted: recs.filter((r) => r.status === "accepted").length,
      rejected: recs.filter((r) => r.status === "rejected").length,
    }),
    [recs]
  );

  // group by date
  const groupedRecs = useMemo(() => {
    const groups: { label: string; items: Recommendation[] }[] = [];
    const groupMap = new Map<string, Recommendation[]>();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    for (const r of filteredRecs) {
      const dateStr = (r.created_at || "").slice(0, 10);
      let label: string;
      if (dateStr === todayStr) label = "Today";
      else if (dateStr === yesterdayStr) label = "Yesterday";
      else {
        const d = new Date(dateStr);
        const diffDays = Math.floor(
          (now.getTime() - d.getTime()) / 86_400_000
        );
        if (diffDays < 7) label = "This week";
        else if (diffDays < 14) label = "Last week";
        else
          label = d.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          });
      }
      const arr = groupMap.get(label) ?? [];
      arr.push(r);
      groupMap.set(label, arr);
    }

    const order = ["Today", "Yesterday", "This week", "Last week"];
    for (const key of order) {
      const items = groupMap.get(key);
      if (items) {
        groups.push({ label: key, items });
        groupMap.delete(key);
      }
    }
    for (const [label, items] of groupMap) {
      groups.push({ label, items });
    }
    return groups;
  }, [filteredRecs]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        activeRole={role}
        onRoleChange={setRole}
        search={search}
        onSearchChange={setSearch}
        onRunSweep={handleSweep}
        isSweepLoading={sweepLoading}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-8 pt-4 pb-4">
        <header className="mb-3 flex shrink-0 items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Inbox</h1>
            <p className="text-sm text-neutral-500">
              AI-generated recommendations backed by your real transaction data.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PreferencesButton />
            <span className="text-xs text-neutral-400">
              {counts.pending} pending
            </span>
          </div>
        </header>

        <div className="mb-3 flex shrink-0 items-center gap-1">
          {(["all", "pending", "accepted", "rejected"] as FilterTab[]).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => {
                  setFilterTab(tab);
                  setSelectedId(null);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filterTab === tab
                    ? "bg-neutral-900 text-white"
                    : "bg-slate-100 text-neutral-600 hover:bg-slate-200"
                }`}
              >
                {tab} ({counts[tab]})
              </button>
            )
          )}
        </div>

        <main className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
          {/* left: email list grouped by date */}
          <aside className="w-[380px] shrink-0 border-r border-slate-200 overflow-y-auto">
            {groupedRecs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <span className="text-3xl">📭</span>
                <p className="text-sm text-neutral-500">
                  {recs.length === 0
                    ? "No recommendations yet. Run an AI Sweep to generate insights."
                    : "No items match this filter."}
                </p>
              </div>
            ) : (
              <div>
                {groupedRecs.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-400">
                      {group.label}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.items.map((r) => (
                        <InboxRow
                          key={r.id}
                          rec={r}
                          isSelected={r.id === selectedId}
                          onSelect={() => setSelectedId(r.id)}
                          onPin={(pinned) => handlePin(r.id, pinned)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* right: detail pane */}
          <section className="flex-1 overflow-y-auto">
            {selected ? (
              <RecommendationDetail
                rec={selected}
                txnMap={txnMap}
                onAccept={handleAccept}
                onReject={handleReject}
                onPin={handlePin}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
                <span className="text-4xl">📬</span>
                <p className="text-sm">
                  Select a recommendation to view details
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

/* ─── inbox row ─── */

function InboxRow({
  rec,
  isSelected,
  onSelect,
  onPin,
}: {
  rec: Recommendation;
  isSelected: boolean;
  onSelect: () => void;
  onPin: (pinned: boolean) => void;
}) {
  const isPending = rec.status === "pending";
  const typeIcon = (type: string) => {
    switch (type) {
      case "goal_health": return "🎯";
      case "alert": return "⚠️";
      case "reallocation": return "🔄";
      case "optimize": return "✂️";
      case "suggestion": return "💡";
      default: return "📋";
    }
  };
  const confColor = (conf: string) =>
    conf === "high"
      ? "text-emerald-600"
      : conf === "medium"
        ? "text-amber-600"
        : "text-neutral-400";

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div
      className={`group relative flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left transition-colors ${
        isSelected
          ? "bg-sky-50 border-l-[3px] border-l-sky-500"
          : isPending
            ? "bg-white hover:bg-slate-50 border-l-[3px] border-l-transparent"
            : "bg-slate-50/50 hover:bg-slate-50 border-l-[3px] border-l-transparent"
      }`}
      onClick={onSelect}
    >
      {/* pin button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPin(!rec.pinned);
        }}
        className={`absolute right-3 top-3 text-xs transition-opacity ${
          rec.pinned
            ? "opacity-100 text-amber-500"
            : "opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-amber-500"
        }`}
        title={rec.pinned ? "Unpin" : "Pin"}
      >
        📌
      </button>

      <div className="flex items-start justify-between gap-2 pr-6">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{typeIcon(rec.type)}</span>
          <span
            className={`text-sm truncate ${
              isPending
                ? "font-semibold text-neutral-900"
                : "font-medium text-neutral-600"
            }`}
          >
            {rec.title}
          </span>
        </div>
        <span className="shrink-0 text-[0.6rem] text-neutral-400 pt-0.5">
          {formatTime(rec.created_at)}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-neutral-500 pl-7">
        {rec.description}
      </p>
      <div className="flex items-center gap-2 pl-7">
        <span className={`text-[0.65rem] font-medium ${confColor(rec.confidence)}`}>
          {rec.confidence}
        </span>
        {rec.action_data?.monthly_savings ? (
          <span className="text-[0.65rem] font-medium text-emerald-600">
            saves ${rec.action_data.monthly_savings}/mo
          </span>
        ) : null}
        {rec.status !== "pending" && (
          <span
            className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
              rec.status === "accepted"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            {rec.status}
          </span>
        )}
        {rec.pinned && (
          <span className="text-[0.6rem] text-amber-500">📌 Pinned</span>
        )}
      </div>
    </div>
  );
}

/* ─── recommendation detail view ─── */

function RecommendationDetail({
  rec,
  txnMap,
  onAccept,
  onReject,
  onPin,
}: {
  rec: Recommendation;
  txnMap: Map<number, Transaction>;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");
  const [feedbackModal, setFeedbackModal] = useState<"accept" | "reject" | null>(null);

  const ad = rec.action_data;
  const relatedTxns = (ad.related_transaction_ids ?? [])
    .map((id) => txnMap.get(id))
    .filter(Boolean) as Transaction[];

  const handleAction = (action: "accept" | "reject") => {
    setFeedbackModal(action);
  };

  const handleFeedbackDone = (action: "accept" | "reject") => {
    if (action === "accept") onAccept(rec.id);
    else onReject(rec.id);
    setFeedbackModal(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-neutral-900 truncate">
                {rec.title}
              </h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.65rem] font-medium text-neutral-600 capitalize">
                {rec.type}
              </span>
              <button
                onClick={() => onPin(rec.id, !rec.pinned)}
                className={`shrink-0 text-sm ${rec.pinned ? "text-amber-500" : "text-neutral-300 hover:text-amber-500"}`}
                title={rec.pinned ? "Unpin" : "Pin"}
              >
                📌
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              {rec.created_at} · {rec.confidence} confidence
              {ad.goal_affected && (
                <>
                  {" · Affects "}
                  <span className="font-medium text-neutral-600">
                    {ad.goal_affected}
                  </span>
                </>
              )}
            </p>
          </div>
          {rec.status === "pending" ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleAction("accept")}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => handleAction("reject")}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-neutral-700 hover:bg-slate-50 transition-colors"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${
                rec.status === "accepted"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {rec.status}
            </span>
          )}
        </div>

        {/* tabs */}
        <div className="mt-3 flex gap-4 text-sm">
          <button
            onClick={() => setActiveTab("details")}
            className={`pb-1 border-b-2 transition-colors ${
              activeTab === "details"
                ? "border-neutral-900 text-neutral-900 font-medium"
                : "border-transparent text-neutral-400 hover:text-neutral-600"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`pb-1 border-b-2 transition-colors ${
              activeTab === "chat"
                ? "border-neutral-900 text-neutral-900 font-medium"
                : "border-transparent text-neutral-400 hover:text-neutral-600"
            }`}
          >
            Discuss
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-auto">
        {activeTab === "details" ? (
          <DetailsTab rec={rec} relatedTxns={relatedTxns} />
        ) : (
          <ChatTab recId={rec.id} />
        )}
      </div>

      {/* feedback modal */}
      {feedbackModal && (
        <FeedbackModal
          recId={rec.id}
          action={feedbackModal}
          onDone={() => handleFeedbackDone(feedbackModal)}
          onCancel={() => setFeedbackModal(null)}
        />
      )}
    </div>
  );
}

/* ─── details tab ─── */

function DetailsTab({
  rec,
  relatedTxns,
}: {
  rec: Recommendation;
  relatedTxns: Transaction[];
}) {
  const ad = rec.action_data;

  return (
    <div className="px-6 py-5 space-y-5">
      <p className="text-sm text-neutral-800 leading-relaxed">
        {rec.description}
      </p>

      {(ad.current_spend || ad.proposed_spend || ad.monthly_savings) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            Financial breakdown
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {ad.current_spend != null && (
              <div>
                <p className="text-[0.65rem] text-neutral-500 uppercase tracking-wide">
                  Current spend
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  ${ad.current_spend.toLocaleString()}
                  <span className="text-xs font-normal text-neutral-400">
                    /mo
                  </span>
                </p>
              </div>
            )}
            {ad.proposed_spend != null && (
              <div>
                <p className="text-[0.65rem] text-neutral-500 uppercase tracking-wide">
                  Proposed spend
                </p>
                <p className="text-lg font-semibold text-emerald-700">
                  ${ad.proposed_spend.toLocaleString()}
                  <span className="text-xs font-normal text-neutral-400">
                    /mo
                  </span>
                </p>
              </div>
            )}
            {ad.monthly_savings != null && ad.monthly_savings > 0 && (
              <div>
                <p className="text-[0.65rem] text-neutral-500 uppercase tracking-wide">
                  Monthly savings
                </p>
                <p className="text-lg font-semibold text-emerald-600">
                  ${ad.monthly_savings.toLocaleString()}
                  <span className="text-xs font-normal text-neutral-400">
                    /mo
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {ad.alternatives && ad.alternatives.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            Alternatives researched
          </h3>
          <div className="space-y-2">
            {ad.alternatives.map((alt: Alternative, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5"
              >
                <div className="min-w-0 flex-1 mr-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-800">
                      {alt.name}
                    </p>
                    {alt.url && (
                      <a
                        href={alt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[0.6rem] font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                      >
                        Visit site ↗
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">{alt.notes}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-neutral-900">
                  ${alt.estimated_cost}
                  <span className="text-xs font-normal text-neutral-400">
                    /mo
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {relatedTxns.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            Linked transactions ({relatedTxns.length})
          </h3>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-neutral-500">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-500">
                    Description
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-neutral-500">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-500">
                    Owner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relatedTxns.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-neutral-500">{txn.date}</td>
                    <td className="px-3 py-2 text-neutral-800 font-medium">
                      {txn.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-neutral-900">
                      ${txn.amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] text-neutral-600">
                        {txn.owner}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td
                    colSpan={2}
                    className="px-3 py-2 font-medium text-neutral-600"
                  >
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-900">
                    ${relatedTxns.reduce((s, t) => s + t.amount, 0).toFixed(2)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-800 mb-2">
          AI reasoning
        </h3>
        <p className="text-sm text-neutral-700 leading-relaxed">
          {rec.reasoning}
        </p>
      </div>

      {ad.goal_affected && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1">
            Goal impact
          </h3>
          <p className="text-sm text-neutral-700">
            This recommendation affects{" "}
            <span className="font-semibold">{ad.goal_affected}</span>
            {ad.monthly_savings ? (
              <>
                {" — redirecting "}
                <span className="font-semibold text-emerald-700">
                  ${ad.monthly_savings}/mo
                </span>
                {" toward this goal would accelerate progress."}
              </>
            ) : ad.amount ? (
              <>
                {" — estimated impact of "}
                <span className="font-semibold">
                  ${ad.amount.toLocaleString()}
                </span>
                .
              </>
            ) : (
              "."
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── chat tab ─── */

function ChatTab({ recId }: { recId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatHistory(recId).then(setMessages).catch(() => {});
  }, [recId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        rec_id: recId,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const { reply } = await api.sendChatMessage(recId, text);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          rec_id: recId,
          role: "assistant",
          content: reply,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          rec_id: recId,
          role: "assistant",
          content: "Sorry, I couldn't process that. Please try again.",
          created_at: new Date().toISOString(),
        },
      ]);
    }
    setSending(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-neutral-400 py-8">
            <p className="text-2xl mb-2">💬</p>
            <p>Ask questions about this recommendation.</p>
            <p className="text-xs mt-1 text-neutral-300">
              e.g. &quot;Why is this important?&quot; or &quot;We prefer to keep Netflix&quot;
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-neutral-900 text-white"
                  : "bg-slate-100 text-neutral-800"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-neutral-400">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 px-6 py-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about this recommendation..."
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-neutral-800 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── feedback modal ─── */

function FeedbackModal({
  recId,
  action,
  onDone,
  onCancel,
}: {
  recId: number;
  action: "accept" | "reject";
  onDone: () => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getFeedbackOptions(recId, action)
      .then((res) => setOptions(res.options))
      .catch(() => {
        setOptions(
          action === "accept"
            ? ["Practical advice", "Good savings estimate", "Aligns with goals", "Easy to implement", "Well-researched"]
            : ["Not realistic", "Too aggressive", "Wrong priorities", "Already tried this", "Doesn't fit lifestyle"]
        );
      })
      .finally(() => setLoading(false));
  }, [recId, action]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.submitFeedback(recId, action, Array.from(selectedTags), comment);
    } catch {
      /* noop */
    }
    setSubmitting(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-900 mb-1">
          {action === "accept" ? "What made this helpful?" : "What didn't work?"}
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          Your feedback helps the AI give better recommendations next time.
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {options.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedTags.has(tag)
                    ? action === "accept"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-white text-neutral-600 hover:bg-slate-50"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional: add a note..."
          rows={2}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 mb-4 resize-none"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-neutral-700 hover:bg-slate-50"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
              action === "accept"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {submitting ? "Saving..." : action === "accept" ? "Accept & Submit" : "Dismiss & Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── preferences drawer ─── */

function PreferencesButton() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Array<{ id: number; action: string; tags: string[]; comment: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const loadPrefs = async () => {
    setLoading(true);
    try {
      const res = await api.getPreferences();
      setPrefs(res.preferences);
      setFeedback(res.feedback_history);
    } catch { /* noop */ }
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(true);
    loadPrefs();
  };

  const handleDeletePref = async (key: string) => {
    try {
      await api.deletePreference(key);
      setPrefs((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch { /* noop */ }
  };

  const handleStartEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditValue(value);
  };

  const handleSaveEdit = async () => {
    if (!editingKey || !editValue.trim()) return;
    try {
      await api.updatePreference(editingKey, editValue.trim());
      setPrefs((prev) => ({ ...prev, [editingKey]: editValue.trim() }));
    } catch { /* noop */ }
    setEditingKey(null);
    setEditValue("");
  };

  const handleDeleteFeedback = async (id: number) => {
    try {
      await api.deleteFeedback(id);
      setFeedback((prev) => prev.filter((f) => f.id !== id));
    } catch { /* noop */ }
  };

  const handleGenerateProfile = async () => {
    setProfileLoading(true);
    try {
      const res = await api.generateAIProfile();
      setPrefs((prev) => ({ ...prev, ai_profile: res.profile }));
    } catch { /* noop */ }
    setProfileLoading(false);
  };

  const profile = prefs.ai_profile;
  const otherPrefs = Object.entries(prefs).filter(([k]) => k !== "ai_profile");
  const hasData = otherPrefs.length > 0 || feedback.length > 0 || !!profile;

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
      >
        <span className="text-sm">🧠</span>
        AI Memory
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">AI Memory</h3>
                <p className="text-xs text-neutral-500">Your preferences and feedback shape every recommendation.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-neutral-500 hover:bg-slate-50">Close</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
                </div>
              ) : !hasData ? (
                <div className="text-center text-sm text-neutral-400 py-8">
                  <p className="text-2xl mb-2">🧠</p>
                  <p>No preferences learned yet.</p>
                  <p className="text-xs text-neutral-300 mt-1">Accept/reject recommendations or chat to teach the AI your preferences.</p>
                  <button onClick={handleGenerateProfile} disabled={profileLoading} className="mt-3 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    {profileLoading ? "Generating..." : "Generate profile from feedback"}
                  </button>
                </div>
              ) : (
                <>
                  {/* AI Profile */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Your AI profile</h4>
                      <button
                        onClick={handleGenerateProfile}
                        disabled={profileLoading}
                        className="text-[0.65rem] text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
                      >
                        {profileLoading ? "Generating..." : profile ? "Regenerate" : "Generate"}
                      </button>
                    </div>
                    {editingKey === "ai_profile" ? (
                      <div className="space-y-2">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-neutral-400 resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingKey(null)} className="text-[0.65rem] text-neutral-500">Cancel</button>
                          <button onClick={handleSaveEdit} className="rounded-lg bg-neutral-900 px-3 py-1 text-[0.65rem] font-medium text-white">Save</button>
                        </div>
                      </div>
                    ) : profile ? (
                      <div className="group relative rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                        <ul className="space-y-1 text-xs text-neutral-700 leading-relaxed">
                          {profile
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line, idx) => (
                              <li key={idx} className="flex gap-1.5">
                                <span className="text-violet-500">•</span>
                                <span>{line.replace(/^-+\s*/, "")}</span>
                              </li>
                            ))}
                        </ul>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                          <button onClick={() => handleStartEdit("ai_profile", profile)} className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[0.6rem] text-neutral-500 hover:bg-slate-50">Edit</button>
                          <button onClick={() => handleDeletePref("ai_profile")} className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[0.6rem] text-rose-500 hover:bg-rose-50">Remove</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400 italic">No profile yet. Click generate to create one from your feedback.</p>
                    )}
                  </div>

                  {/* Other preferences */}
                  {otherPrefs.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Learned preferences</h4>
                      <div className="space-y-2">
                        {otherPrefs.map(([key, value]) => (
                          <div key={key} className="group relative rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            {editingKey === key ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  rows={2}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-neutral-400 resize-none"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => setEditingKey(null)} className="text-[0.65rem] text-neutral-500">Cancel</button>
                                  <button onClick={handleSaveEdit} className="rounded-lg bg-neutral-900 px-3 py-1 text-[0.65rem] font-medium text-white">Save</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-[0.65rem] font-medium text-neutral-400 uppercase tracking-wide mb-0.5">
                                  {key.startsWith("chat_pref_") ? "From conversation" : key.replace(/_/g, " ")}
                                </p>
                                <p className="text-xs text-neutral-700 pr-16">{value}</p>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                  <button onClick={() => handleStartEdit(key, value)} className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[0.6rem] text-neutral-500 hover:bg-slate-50">Edit</button>
                                  <button onClick={() => handleDeletePref(key)} className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[0.6rem] text-rose-500 hover:bg-rose-50">Remove</button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback */}
                  {feedback.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Recent feedback ({feedback.length})</h4>
                      <div className="space-y-2">
                        {feedback.slice(0, 10).map((f) => (
                          <div key={f.id} className="group relative flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${f.action === "accept" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {f.action}
                            </span>
                            <div className="min-w-0 flex-1">
                              {f.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {f.tags.map((tag) => (
                                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] text-neutral-600">{tag}</span>
                                  ))}
                                </div>
                              )}
                              {f.comment && <p className="text-xs text-neutral-500">{f.comment}</p>}
                              <p className="text-[0.6rem] text-neutral-300 mt-0.5">{f.created_at}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteFeedback(f.id)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 rounded-full border border-slate-200 px-2 py-0.5 text-[0.6rem] text-rose-500 hover:bg-rose-50 transition-opacity"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
