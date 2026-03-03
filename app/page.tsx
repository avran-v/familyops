"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, API_BASE, type Transaction, type Goal, type TransactionProposal, type DashboardWidgetProposal } from "@/lib/api";

type Role = "parent" | "teen" | "child";
type TimelineViewMode = "list" | "byTag" | "byOwner";
type DateRange = "this-month" | "last-30" | "this-year" | "all-time";

const ROLE_LABELS: Record<Role, string> = {
  parent: "Parent / Admin",
  teen: "Teen / Contributor",
  child: "Child / Viewer",
};

export default function DashboardPage() {
  const [activeRole, setActiveRole] = useState<Role>("parent");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<Transaction | null>(null);
  const [isSweepLoading, setIsSweepLoading] = useState(false);
  const [viewMode, setViewMode] = useState<TimelineViewMode>("list");
  const [dateRange, setDateRange] = useState<DateRange>("last-30");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pendingProposals, setPendingProposals] = useState<TransactionProposal[]>([]);
  const [goalsManagerOpen, setGoalsManagerOpen] = useState(false);

  const [dashboardHtml, setDashboardHtml] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [dashboardIframeHeight, setDashboardIframeHeight] = useState<string>("480px");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [txns, g, proposals] = await Promise.all([
        api.getTransactions(),
        api.getGoals(),
        api.getTransactionProposals("pending"),
      ]);
      setTransactions(txns);
      setGoals(g);
      setPendingProposals(proposals);
    } catch {
      /* API not running — keep empty */
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const onProposalCreated = () => loadData();
    window.addEventListener("familyops:proposal-created", onProposalCreated);
    return () => window.removeEventListener("familyops:proposal-created", onProposalCreated);
  }, [loadData]);

  useEffect(() => {
    api.getDashboardState().then((state) => {
      if (state?.html) setDashboardHtml(state.html);
      setDashboardLoaded(true);
    }).catch(() => setDashboardLoaded(true));
  }, []);

  const pushDataToIframe = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !dashboardHtml) return;
    const payload = {
      transactions: transactions.slice(0, 100),
      goals,
      stats: computeStats(transactions),
    };
    iframeRef.current.contentWindow.postMessage({ type: "DATA_UPDATE", payload }, "*");
  }, [transactions, goals, dashboardHtml]);

  const resizeIframeToContent = useCallback(() => {
    if (!iframeRef.current) return;
    try {
      const body = iframeRef.current.contentDocument?.body;
      if (!body) return;
      const h = body.scrollHeight;
      if (h && Number.isFinite(h)) setDashboardIframeHeight(`${Math.min(1200, h + 16)}px`);
    } catch {
      /* ignore (sandbox restrictions / not ready yet) */
    }
  }, []);

  useEffect(() => {
    pushDataToIframe();
  }, [pushDataToIframe]);

  const handleRunSweep = async () => {
    setIsSweepLoading(true);
    try { await api.runAISweep(); } catch { /* noop */ }
    await loadData();
    setIsSweepLoading(false);
  };

  const filteredTimeline = useMemo(() => {
    const now = new Date();
    const inRange = (dateStr: string) => {
      const d = new Date(dateStr);
      const diffDays = (now.getTime() - d.getTime()) / 86_400_000;
      switch (dateRange) {
        case "this-month":
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        case "last-30":
          return diffDays <= 30 && diffDays >= 0;
        case "this-year":
          return d.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    };
    return transactions.filter((item) => {
      if (!inRange(item.date)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.description.toLowerCase().includes(q) ||
        item.owner.toLowerCase().includes(q) ||
        (item.category ?? "").toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [transactions, dateRange, search]);

  const activeGoals = goals.filter((g) => g.status === "active");

  const handleApproveProposal = async (proposalId: number) => {
    try {
      await api.approveTransactionProposal(proposalId);
      await loadData();
    } catch {
      /* noop */
    }
  };

  const handleRejectProposal = async (proposalId: number) => {
    try {
      await api.rejectTransactionProposal(proposalId);
      await loadData();
    } catch {
      /* noop */
    }
  };

  const handleDashboardBuilt = useCallback((html: string) => {
    setDashboardHtml(html);
  }, []);

  const handleDashboardCleared = useCallback(() => {
    setDashboardHtml(null);
  }, []);

  return (
    <div className="min-h-screen">
      <TopBar
        activeRole={activeRole}
        onRoleChange={setActiveRole}
        search={search}
        onSearchChange={setSearch}
        onRunSweep={handleRunSweep}
        isSweepLoading={isSweepLoading}
      />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <main className="flex flex-1 flex-col px-8 pb-8 pt-4 space-y-4">
          <GoalsStrip goals={activeGoals} onManage={() => setGoalsManagerOpen(true)} />

          {dashboardLoaded && (
            <DashboardSection
              html={dashboardHtml}
              iframeRef={iframeRef}
              onIframeLoad={() => {
                pushDataToIframe();
                resizeIframeToContent();
                window.setTimeout(resizeIframeToContent, 50);
                window.setTimeout(resizeIframeToContent, 250);
              }}
              height={dashboardIframeHeight}
              onOpenChat={() => setChatOpen(true)}
            />
          )}

          <div className="flex flex-1 gap-4">
            <div className={selectedItem ? "flex-1" : "w-full"}>
              <TimelineTable
                items={filteredTimeline}
                allTransactions={transactions}
                pendingProposals={pendingProposals}
                viewMode={viewMode}
                dateRange={dateRange}
                onChangeViewMode={setViewMode}
                onChangeDateRange={setDateRange}
                onSelect={setSelectedItem}
                onApproveProposal={handleApproveProposal}
                onRejectProposal={handleRejectProposal}
                onQuickAddTransaction={loadData}
              />
            </div>
            {selectedItem && (
              <RightDrawer
                role={activeRole}
                item={selectedItem}
                onClose={() => setSelectedItem(null)}
                onUpdate={async () => {
                  const [txns] = await Promise.all([api.getTransactions(), loadData()]);
                  const fresh = txns.find((t: Transaction) => t.id === selectedItem.id);
                  if (fresh) setSelectedItem(fresh);
                }}
              />
            )}
          </div>
        </main>
      </div>

      <AgentChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onDashboardBuilt={handleDashboardBuilt}
        onDashboardCleared={handleDashboardCleared}
        hasHtml={!!dashboardHtml}
      />
      <ManageGoalsDrawer
        open={goalsManagerOpen}
        goals={goals}
        onClose={() => setGoalsManagerOpen(false)}
        onSaved={async () => {
          await loadData();
          setGoalsManagerOpen(false);
        }}
      />

    </div>
  );
}

/* ─── compute stats helper (mirrors backend) ─── */

function computeStats(transactions: Transaction[]) {
  const byCategory: Record<string, number> = {};
  const byOwner: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  let total = 0;
  for (const t of transactions) {
    total += t.amount;
    const cat = t.category || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + t.amount;
    byOwner[t.owner] = (byOwner[t.owner] || 0) + t.amount;
    const month = (t.date || "").slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + t.amount;
    for (const tag of t.tags || []) byTag[tag] = (byTag[tag] || 0) + t.amount;
  }
  return {
    count: transactions.length,
    total: Math.round(total * 100) / 100,
    by_category: byCategory,
    by_owner: byOwner,
    by_month: byMonth,
    by_tag: byTag,
  };
}

/* ─── dashboard section (iframe + empty state) ─── */

function DashboardSection({ html, iframeRef, onIframeLoad, onOpenChat, height }: {
  html: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onIframeLoad: () => void;
  onOpenChat: () => void;
  height: string;
}) {
  if (!html) {
    return (
      <section
        className="rounded-xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-sky-50/30 px-8 py-10 text-center cursor-pointer hover:border-sky-300 transition-colors"
        onClick={onOpenChat}
      >
        <div className="text-3xl mb-3">🤖</div>
        <h3 className="text-base font-semibold text-neutral-800 mb-1">Your AI Dashboard</h3>
        <p className="text-sm text-neutral-500 max-w-md mx-auto">
          Chat with your AI agent to build a personalized dashboard. It will create charts, tables, and insights from your financial data.
        </p>
        <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
          Start building
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden relative group">
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onOpenChat}
          className="rounded-lg bg-white/90 border border-slate-200 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-slate-50 backdrop-blur"
        >
          🤖 Edit Dashboard
        </button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        className="w-full border-0"
        style={{ height }}
        onLoad={onIframeLoad}
        title="AI Dashboard"
      />
    </section>
  );
}

/* ─── agent chat panel (plan → approve → build) ─── */

type PanelStep = "prompt" | "planning" | "review" | "building" | "done";

function AgentChatPanel({ open, onClose, onDashboardBuilt, onDashboardCleared, hasHtml }: {
  open: boolean;
  onClose: () => void;
  onDashboardBuilt: (html: string) => void;
  onDashboardCleared: () => void;
  hasHtml: boolean;
}) {
  const [step, setStep] = useState<PanelStep>("prompt");
  const [input, setInput] = useState("");
  const [proposals, setProposals] = useState<(DashboardWidgetProposal & { enabled: boolean })[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [customWidgetInput, setCustomWidgetInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [streamPhase, setStreamPhase] = useState<"styles" | "widgets" | "scripts" | "idle">("idle");
  const [streamChars, setStreamChars] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && step === "prompt") setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, step]);

  useEffect(() => {
    if (step !== "building" && step !== "planning") { setElapsed(0); return; }
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (!open || suggestions.length > 0) return;
    setSuggestionsLoading(true);
    api.dashboardSuggestions().then((r) => setSuggestions(r.suggestions)).catch(() => {
      setSuggestions(["Build me an overview of our finances", "Show spending trends and goal progress"]);
    }).finally(() => setSuggestionsLoading(false));
  }, [open, suggestions.length]);

  const handlePlan = async (text?: string) => {
    const msg = (text || input).trim();
    setInput("");
    setStep("planning");
    setBuildError(null);
    try {
      const res = await api.dashboardPlan(msg);
      setProposals(res.widgets.map((w) => ({ ...w, enabled: true })));
      setStep("review");
    } catch {
      setStep("prompt");
      setBuildError("Failed to generate plan. Try again.");
    }
  };

  const handleBuild = async () => {
    const approved = proposals.filter((w) => w.enabled);
    if (approved.length === 0) return;
    setStep("building");
    setBuildError(null);
    setStreamChars(0);
    setStreamPhase("styles");

    try {
      const res = await fetch(`${API_BASE}/dashboard/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: approved, message: "" }),
      });

      if (!res.ok || !res.body) throw new Error("Build failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let html = "";
      let buffer = "";
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.t) {
              html += evt.t;
              setStreamChars(html.length);
              if (html.includes("<body")) setStreamPhase("widgets");
              if (html.includes("<script")) setStreamPhase("scripts");
            }
            if (evt.done) {
              finished = true;
              onDashboardBuilt(html);
              setStreamPhase("idle");
              setStep("done");
            }
            if (evt.error) throw new Error(evt.error);
          } catch (parseErr) {
            if ((parseErr as Error).message?.includes("Build")) throw parseErr;
          }
        }
      }

      if (!finished && html) {
        onDashboardBuilt(html);
        setStreamPhase("idle");
        setStep("done");
      }
    } catch {
      setStreamPhase("idle");
      setStep("review");
      setBuildError("Failed to build dashboard. Try again.");
    }
  };

  const handleReset = () => {
    setStep("prompt");
    setProposals([]);
    setBuildError(null);
    setCustomWidgetInput("");
    setSuggestions([]);
  };

  const handleClear = async () => {
    try {
      await api.clearDashboard();
      onDashboardCleared();
      setShowClearConfirm(false);
      handleReset();
    } catch { /* ignore */ }
  };

  const handleAddCustomWidget = () => {
    const text = customWidgetInput.trim();
    if (!text) return;
    const id = "custom_" + Date.now();
    setProposals((prev) => [...prev, { id, title: text, description: "Custom widget requested by user", type: "custom", enabled: true }]);
    setCustomWidgetInput("");
  };

  const toggleWidget = (id: string) => {
    setProposals((prev) => prev.map((w) => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  const removeWidget = (id: string) => {
    setProposals((prev) => prev.filter((w) => w.id !== id));
  };

  const approvedCount = proposals.filter((w) => w.enabled).length;

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-white border-l border-slate-200 shadow-2xl transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ width: "400px" }}
    >
      {/* header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-sm">🤖</div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">Dashboard Agent</h3>
            <p className="text-[0.65rem] text-neutral-400">
              {step === "prompt" && "Tell me what you want to see"}
              {step === "planning" && "Analyzing your data..."}
              {step === "review" && "Review the plan below"}
              {step === "building" && "Building your dashboard..."}
              {step === "done" && "Dashboard ready!"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-slate-100 hover:text-neutral-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-auto px-4 py-4">

        {buildError && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{buildError}</div>
        )}

        {/* clear confirmation overlay */}
        {showClearConfirm && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-rose-800">Clear dashboard?</p>
            <p className="text-xs text-rose-600">This will remove your current AI dashboard permanently. You can always build a new one.</p>
            <div className="flex gap-2">
              <button onClick={handleClear} className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700">
                Yes, clear it
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* step: prompt */}
        {step === "prompt" && !showClearConfirm && (
          <div className="space-y-4">
            {hasHtml ? (
              <>
                <div className="text-center py-3">
                  <div className="text-2xl mb-2">🎨</div>
                  <p className="text-sm font-medium text-neutral-700 mb-1">Edit your dashboard</p>
                  <p className="text-xs text-neutral-400">Choose an action below, or describe what you want to change.</p>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => handlePlan("Redesign the entire dashboard with the best widgets for this household")}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs text-neutral-700 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                  >
                    <span className="text-base">🔄</span>
                    <div>
                      <p className="font-medium">Rebuild entirely</p>
                      <p className="text-[0.6rem] text-neutral-400">Start fresh with new widget proposals</p>
                    </div>
                  </button>
                  <button
                    onClick={() => handlePlan("Suggest modifications and additions to improve the current dashboard")}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs text-neutral-700 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                  >
                    <span className="text-base">✏️</span>
                    <div>
                      <p className="font-medium">Edit widgets</p>
                      <p className="text-[0.6rem] text-neutral-400">Swap, add, or remove specific widgets</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex w-full items-center gap-3 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2.5 text-left text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors"
                  >
                    <span className="text-base">🗑️</span>
                    <div>
                      <p className="font-medium">Clear dashboard</p>
                      <p className="text-[0.6rem] text-rose-400">Remove the current dashboard entirely</p>
                    </div>
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <p className="text-[0.65rem] text-neutral-400 mb-2 font-medium uppercase tracking-wider">Or try something new</p>
                  <div className="space-y-1.5">
                    {suggestionsLoading ? (
                      <p className="text-xs text-neutral-400 text-center py-2">Loading suggestions...</p>
                    ) : suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handlePlan(s)}
                        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-neutral-600 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                      >
                        <span className="text-neutral-300">→</span> {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-center py-4">
                  <div className="text-2xl mb-2">✨</div>
                  <p className="text-sm font-medium text-neutral-700 mb-1">Let&apos;s build your dashboard</p>
                  <p className="text-xs text-neutral-400">
                    Describe what you want, or pick a suggestion. The AI will propose widgets for your approval.
                  </p>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => handlePlan("Use a polished default household overview layout with general widgets for the whole family")}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs text-neutral-700 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                  >
                    <span className="text-sm">⭐</span>
                    <span>
                      <span className="font-medium">Try default overview</span>
                      <span className="block text-[0.6rem] text-neutral-400">Balanced summary for the whole household</span>
                    </span>
                  </button>
                  {suggestionsLoading ? (
                    <p className="text-xs text-neutral-400 text-center py-2">Loading suggestions...</p>
                  ) : suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handlePlan(s)}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs text-neutral-700 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                    >
                      <span className="text-sm">→</span> {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* step: planning (loading) */}
        {step === "planning" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="h-2.5 w-2.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="h-2.5 w-2.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-xs text-neutral-500">Analyzing your financial data...</p>
            <p className="text-[0.6rem] text-neutral-400 tabular-nums">{elapsed}s</p>
          </div>
        )}

        {/* step: review (checkboxes + custom widgets) */}
        {step === "review" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-neutral-800 mb-0.5">Proposed widgets</p>
              <p className="text-xs text-neutral-400">Toggle off any you don&apos;t want. Add your own below.</p>
            </div>
            <div className="space-y-2">
              {proposals.map((w) => (
                <div
                  key={w.id}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    w.enabled
                      ? "border-sky-200 bg-sky-50/50"
                      : "border-slate-200 bg-slate-50/50 opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={w.enabled}
                    onChange={() => toggleWidget(w.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-neutral-800">{w.title}</p>
                    <p className="text-[0.65rem] text-neutral-500 leading-relaxed">{w.description}</p>
                    <span className="inline-block mt-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[0.6rem] text-neutral-400">{w.type.replace("_", " ")}</span>
                  </div>
                  {w.id.startsWith("custom_") && (
                    <button onClick={() => removeWidget(w.id)} className="text-neutral-300 hover:text-rose-400 mt-0.5 text-xs">✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* add custom widget */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[0.65rem] text-neutral-400 mb-2 font-medium uppercase tracking-wider">Add custom widget</p>
              <form onSubmit={(e) => { e.preventDefault(); handleAddCustomWidget(); }} className="flex items-center gap-2">
                <input
                  type="text"
                  value={customWidgetInput}
                  onChange={(e) => setCustomWidgetInput(e.target.value)}
                  placeholder="e.g. GitHub-style no-spend streak tracker"
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-300 placeholder:text-neutral-300"
                />
                <button type="submit" disabled={!customWidgetInput.trim()} className="rounded-lg bg-sky-500 px-2.5 py-2 text-xs font-medium text-white disabled:opacity-40 hover:bg-sky-600">+</button>
              </form>
            </div>

          </div>
        )}

        {/* step: building */}
        {step === "building" && (() => {
          const phases = [
            { key: "styles", label: "Setting up styles", icon: "🎨" },
            { key: "widgets", label: `Building ${approvedCount} widgets`, icon: "🧩" },
            { key: "scripts", label: "Wiring up interactivity", icon: "⚡" },
          ] as const;
          const currentIdx = phases.findIndex((p) => p.key === streamPhase);
          const pct = streamPhase === "styles" ? 15 : streamPhase === "widgets" ? 55 : 85;

          return (
            <div className="py-6 space-y-5">
              <div className="text-center">
                <p className="text-sm font-medium text-neutral-700 mb-1">Building your dashboard</p>
                <p className="text-xs text-neutral-400 tabular-nums">{elapsed}s &middot; {(streamChars / 1000).toFixed(1)}k chars</p>
              </div>

              <div className="space-y-2">
                {phases.map((p, i) => {
                  const isDone = i < currentIdx;
                  const isActive = i === currentIdx;
                  return (
                    <div key={p.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${isDone ? "border-emerald-200 bg-emerald-50/50" : isActive ? "border-sky-200 bg-sky-50/50" : "border-slate-100 bg-slate-50/30"}`}>
                      {isDone ? (
                        <span className="text-emerald-500 text-sm">✓</span>
                      ) : isActive ? (
                        <div className="h-4 w-4 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin" />
                      ) : (
                        <span className="text-sm opacity-40">{p.icon}</span>
                      )}
                      <span className={`text-xs ${isDone ? "text-emerald-700 font-medium" : isActive ? "text-sky-700 font-medium" : "text-neutral-400"}`}>{p.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          );
        })()}

        {/* step: done */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="text-3xl">🎉</div>
            <p className="text-sm font-semibold text-neutral-800">Dashboard built!</p>
            <p className="text-xs text-neutral-500">Scroll up to see it. You can edit or rebuild anytime.</p>
            <button
              onClick={handleReset}
              className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-slate-50"
            >
              Edit dashboard
            </button>
          </div>
        )}
      </div>

      {/* footer */}
      {step === "review" && (
        <div className="border-t border-slate-200 px-4 py-3 space-y-2">
          <button
            onClick={handleBuild}
            disabled={approvedCount === 0}
            className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-neutral-800"
          >
            Build Dashboard ({approvedCount} widget{approvedCount !== 1 ? "s" : ""})
          </button>
          <button
            onClick={handleReset}
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-xs text-neutral-500 hover:bg-slate-50"
          >
            Start over
          </button>
        </div>
      )}

      {step === "prompt" && (
        <div className="border-t border-slate-200 px-4 py-3">
          <form
            onSubmit={(e) => { e.preventDefault(); handlePlan(); }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hasHtml ? "Describe what to change..." : "Describe your ideal dashboard..."}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-300"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              →
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─── shared top bar ─── */

export function TopBar(props: {
  activeRole: Role;
  onRoleChange: (role: Role) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onRunSweep: () => void;
  isSweepLoading: boolean;
}) {
  const { activeRole, onRoleChange, search, onSearchChange, onRunSweep, isSweepLoading } = props;
  const pathname = usePathname();
  const navItems = [
    { href: "/", label: "Home" },
    { href: "/inbox", label: "Inbox" },
    { href: "/playground", label: "Playground" },
  ];

  return (
    <header className="w-full border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 text-base font-bold text-white flex items-center justify-center shadow-sm">
            🌱
          </div>
          <span className="text-base font-semibold">FamilyOps</span>
        </Link>

        <nav className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-1 text-sm">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1 transition-colors ${
                  active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search…"
              className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 pr-12 text-sm outline-none focus:border-neutral-400"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[0.55rem] font-mono text-neutral-400 pointer-events-none">⌘K</kbd>
          </div>
          <button
            onClick={onRunSweep}
            disabled={isSweepLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSweepLoading ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            )}
            AI Sweep
          </button>
          <select
            value={activeRole}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-neutral-700"
          >
            <option value="parent">{ROLE_LABELS.parent}</option>
            <option value="teen">{ROLE_LABELS.teen}</option>
            <option value="child">{ROLE_LABELS.child}</option>
          </select>
        </div>
      </div>
    </header>
  );
}

/* ─── goals strip ─── */

function GoalsStrip({ goals, onManage }: { goals: Goal[]; onManage: () => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Family goals</h2>
          <p className="text-base text-neutral-700">
            {goals.length
              ? "Every AI decision is measured against these first."
              : "No goals yet. Add one so the AI can optimize for what matters."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">🎯 Tracked by AI</span>
          <button
            onClick={onManage}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-slate-50"
          >
            {goals.length ? "Edit goals" : "+ Add goal"}
          </button>
        </div>
      </div>
      {goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-neutral-500">
          Set your first family goal (vacation, emergency fund, debt payoff) so recommendations and dashboards prioritize it.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {goals.map((goal) => {
            const pct = goal.target_amount > 0
              ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
              : 0;
            return (
              <article key={goal.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-base">{goal.icon}</span>
                  <span className="text-sm font-semibold text-neutral-800">{goal.name}</span>
                </div>
                <div className="mb-1 flex items-center justify-between text-neutral-600">
                  <span>${goal.current_amount.toLocaleString()} / ${goal.target_amount.toLocaleString()}</span>
                  <span className="text-neutral-500">{goal.deadline}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400" style={{ width: `${pct}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      )}

    </section>
  );
}

function ManageGoalsDrawer(props: {
  open: boolean;
  goals: Goal[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { open, goals, onClose, onSaved } = props;
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    icon: "🎯",
    target_amount: "",
    current_amount: "0",
    deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    priority: "medium",
  });

  const handleCreateGoal = async () => {
    if (!draft.name.trim() || !draft.target_amount) return;
    setSaving(true);
    try {
      await api.createGoal({
        name: draft.name.trim(),
        icon: draft.icon || "🎯",
        target_amount: Number(draft.target_amount),
        current_amount: Number(draft.current_amount || 0),
        deadline: draft.deadline,
        priority: draft.priority,
        status: "active",
      });
      await onSaved();
      setDraft({
        name: "",
        icon: "🎯",
        target_amount: "",
        current_amount: "0",
        deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        priority: "medium",
      });
    } catch {
      /* noop */
    }
    setSaving(false);
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 flex w-[380px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">Edit goals</h3>
          <p className="text-[0.65rem] text-neutral-400">{goals.length} goal{goals.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-slate-100 hover:text-neutral-600">✕</button>
      </div>
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {goals.length > 0 && (
          <div className="space-y-2">
            {goals.map((g) => (
              <div key={g.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-neutral-800">{g.icon} {g.name}</p>
                <p className="text-[0.65rem] text-neutral-500">${g.current_amount.toLocaleString()} / ${g.target_amount.toLocaleString()} by {fmtDate(g.deadline)}</p>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Add goal</p>
          <div className="grid grid-cols-1 gap-2">
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Goal name" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input value={draft.icon} onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))} placeholder="Icon" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
              <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={draft.target_amount} onChange={(e) => setDraft((d) => ({ ...d, target_amount: e.target.value }))} placeholder="Target amount" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
              <input type="number" value={draft.current_amount} onChange={(e) => setDraft((d) => ({ ...d, current_amount: e.target.value }))} placeholder="Current amount" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            </div>
            <input type="date" value={draft.deadline} onChange={(e) => setDraft((d) => ({ ...d, deadline: e.target.value }))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
          </div>
          <div className="flex justify-end">
            <button onClick={handleCreateGoal} disabled={saving || !draft.name.trim() || !draft.target_amount} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "Saving..." : "Create goal"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── timeline table ─── */

function TimelineTable(props: {
  items: Transaction[];
  allTransactions: Transaction[];
  pendingProposals: TransactionProposal[];
  viewMode: TimelineViewMode;
  dateRange: DateRange;
  onChangeViewMode: (m: TimelineViewMode) => void;
  onChangeDateRange: (r: DateRange) => void;
  onSelect: (item: Transaction) => void;
  onApproveProposal: (proposalId: number) => void;
  onRejectProposal: (proposalId: number) => void;
  onQuickAddTransaction: () => Promise<void> | void;
}) {
  const {
    items,
    allTransactions,
    pendingProposals,
    viewMode,
    dateRange,
    onChangeViewMode,
    onChangeDateRange,
    onSelect,
    onApproveProposal,
    onRejectProposal,
    onQuickAddTransaction,
  } = props;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickDraft, setQuickDraft] = useState({
    description: "",
    amount: "",
    owner: "Household",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    tags: "",
  });

  const groupedByTag = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const item of items) for (const tag of item.tags) {
      const cur = map.get(tag) ?? [];
      cur.push(item);
      map.set(tag, cur);
    }
    return Array.from(map.entries());
  }, [items]);

  const groupedByOwner = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const item of items) {
      const cur = map.get(item.owner) ?? [];
      cur.push(item);
      map.set(item.owner, cur);
    }
    return Array.from(map.entries());
  }, [items]);

  const suggestion = useMemo(
    () => suggestTransactionFromHistory(quickDraft.description, allTransactions),
    [quickDraft.description, allTransactions]
  );

  const applySuggestion = () => {
    if (!suggestion) return;
    setQuickDraft((prev) => ({
      ...prev,
      owner: suggestion.owner || prev.owner,
      category: suggestion.category || prev.category,
      tags: suggestion.tags.join(", "),
    }));
  };

  const saveQuickTransaction = async () => {
    if (!quickDraft.description.trim() || !quickDraft.amount) return;
    setQuickSaving(true);
    try {
      await api.createTransaction({
        description: quickDraft.description.trim(),
        amount: Number(quickDraft.amount),
        owner: quickDraft.owner.trim() || "Household",
        date: quickDraft.date,
        category: quickDraft.category.trim() || null,
        tags: quickDraft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      await onQuickAddTransaction();
      setQuickAddOpen(false);
      setQuickDraft({
        description: "",
        amount: "",
        owner: "Household",
        date: new Date().toISOString().slice(0, 10),
        category: "",
        tags: "",
      });
    } catch {
      /* noop */
    }
    setQuickSaving(false);
  };

  const Row = ({ item }: { item: Transaction }) => (
    <tr key={item.id} className="cursor-pointer border-t border-slate-100 hover:bg-sky-50/40 transition-colors" onClick={() => onSelect(item)}>
      <td className="px-4 py-2 text-xs text-neutral-500">{fmtDate(item.date)}</td>
      <td className="px-4 py-2">
        <span className="text-sm font-medium">{categoryEmoji(item.category)} {item.description}</span>
        <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[0.65rem] text-sky-700">{item.category || "Other"}</span>
      </td>
      <td className="px-4 py-2 text-sm tabular-nums font-semibold text-indigo-700">${item.amount.toFixed(2)}</td>
      <td className="px-4 py-2"><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.7rem] text-violet-700">👤 {item.owner}</span></td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {item.tags.map((t) => <span key={t} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] text-emerald-700">#{t}</span>)}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-base font-semibold">Household timeline 🧾</h2>
          <p className="text-sm text-neutral-500">All transactions from the API, grouped and filterable.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setQuickAddOpen(true)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-slate-50"
          >
            + Quick add
          </button>
          <ChipGroup label="View" options={[["list","List"],["byTag","By tag"],["byOwner","By owner"]]} value={viewMode} onChange={(v) => onChangeViewMode(v as TimelineViewMode)} />
          <ChipGroup label="Range" options={[["this-month","Month"],["last-30","30 days"],["this-year","Year"],["all-time","All"]]} value={dateRange} onChange={(v) => onChangeDateRange(v as DateRange)} />
        </div>
      </div>
      {quickAddOpen && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quick add transaction</p>
            {suggestion && (
              <button onClick={applySuggestion} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[0.65rem] font-medium text-sky-700 hover:bg-sky-100">
                Apply AI suggestion
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={quickDraft.description} onChange={(e) => setQuickDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
            <input type="number" value={quickDraft.amount} onChange={(e) => setQuickDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
            <input value={quickDraft.owner} onChange={(e) => setQuickDraft((d) => ({ ...d, owner: e.target.value }))} placeholder="Owner" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
            <input type="date" value={quickDraft.date} onChange={(e) => setQuickDraft((d) => ({ ...d, date: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
            <input value={quickDraft.category} onChange={(e) => setQuickDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Category" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
            <input value={quickDraft.tags} onChange={(e) => setQuickDraft((d) => ({ ...d, tags: e.target.value }))} placeholder="Tags (comma-separated)" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
          </div>
          {suggestion && (
            <p className="text-[0.7rem] text-neutral-500">
              Suggested from {suggestion.basedOn} similar transactions: owner <span className="font-medium text-neutral-700">{suggestion.owner}</span>,
              {" "}category <span className="font-medium text-neutral-700">{suggestion.category || "Uncategorized"}</span>,
              {" "}tags {suggestion.tags.length ? suggestion.tags.map((t) => `#${t}`).join(", ") : "none"}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setQuickAddOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-neutral-600">Cancel</button>
            <button onClick={saveQuickTransaction} disabled={quickSaving || !quickDraft.description.trim() || !quickDraft.amount} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {quickSaving ? "Saving..." : "Save transaction"}
            </button>
          </div>
        </div>
      )}
      {pendingProposals.length > 0 && (
        <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 via-rose-50 to-sky-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              ✨ Pending transaction drafts ({pendingProposals.length})
            </h3>
            <span className="text-[0.65rem] text-amber-700">
              Created from Cmd+K. Approve to apply.
            </span>
          </div>
          <div className="space-y-2">
            {pendingProposals.slice(0, 6).map((proposal) => (
              <div key={proposal.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-white/90 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-neutral-800">
                    {proposal.proposal_type === "add" ? "➕ Add draft" : "✏️ Edit draft"}
                    {proposal.original_transaction_id ? ` #${proposal.original_transaction_id}` : ""}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {proposal.description || "No description"} · ${Number(proposal.amount ?? 0).toFixed(2)} · {proposal.owner || "Household"}
                  </p>
                  {proposal.tags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {proposal.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-sky-100 px-2 py-0.5 text-[0.6rem] text-sky-700">#{tag}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[0.65rem] text-neutral-400">{proposal.date ? fmtDate(proposal.date) : "No date"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => onApproveProposal(proposal.id)}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[0.65rem] font-medium text-white hover:bg-emerald-700"
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => onRejectProposal(proposal.id)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[0.65rem] font-medium text-neutral-700 hover:bg-slate-50"
                  >
                    🗑 Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="max-h-[520px] overflow-auto text-sm">
        {viewMode === "list" && (
          <table className="min-w-full">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
                <th className="px-4 py-2 text-left font-medium">Amount</th>
                <th className="px-4 py-2 text-left font-medium">Owner</th>
                <th className="px-4 py-2 text-left font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>{items.map((item) => <Row key={item.id} item={item} />)}</tbody>
          </table>
        )}
        {viewMode !== "list" && (
          <div className="space-y-4 px-4 pb-4 pt-2">
            {(viewMode === "byTag" ? groupedByTag : groupedByOwner).map(([key, group]) => (
              <section key={key} className="rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
                  <span>{viewMode === "byTag" ? "#" : "👤"} {key}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] text-neutral-500">{group.length}</span>
                </div>
                <table className="min-w-full"><tbody>{group.map((item) => <Row key={item.id} item={item} />)}</tbody></table>
              </section>
            ))}
          </div>
        )}
        {items.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-neutral-400">No transactions match this filter.</div>
        )}
      </div>
    </div>
  );
}

/* ─── right drawer ─── */

function RightDrawer(props: { role: Role; item: Transaction; onClose: () => void; onUpdate: () => void }) {
  const { item, onClose, onUpdate } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ description: item.description, amount: String(item.amount), owner: item.owner, category: item.category ?? "", date: fmtDate(item.date), tags: item.tags.join(", ") });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Array<{ id: number; snapshot: Transaction; edited_by: string; created_at: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [explainResult, setExplainResult] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDraft({ description: item.description, amount: String(item.amount), owner: item.owner, category: item.category ?? "", date: fmtDate(item.date), tags: item.tags.join(", ") });
    setEditing(false);
    setExplainResult(null);
  }, [item.id, item.description, item.amount, item.owner, item.category, item.date, item.tags]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateTransaction(item.id, {
        description: draft.description,
        amount: parseFloat(draft.amount),
        owner: draft.owner,
        category: draft.category || null,
        date: draft.date,
        tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setEditing(false);
      onUpdate();
    } catch { /* noop */ }
    setSaving(false);
  };

  const loadHistory = async () => {
    try {
      const h = await api.getTransactionHistory(item.id);
      setHistory(h);
    } catch { /* noop */ }
    setShowHistory(true);
  };

  const handleRevert = async (editId: number) => {
    try {
      await api.revertTransaction(item.id, editId);
      onUpdate();
      loadHistory();
    } catch { /* noop */ }
  };

  const handleExplain = async () => {
    setExplainLoading(true);
    try {
      const res = await api.explainTransaction(item.id);
      const reasoning = (res.ai_reasoning as string) || "";
      const similar = (res.similar_transactions as Array<{ description: string; amount: number }>) || [];
      let text = reasoning || "No AI reasoning stored for this transaction.";
      if (similar.length > 0) {
        text += "\n\nSimilar transactions: " + similar.map((s) => `${s.description} ($${s.amount})`).join(", ");
      }
      setExplainResult(text);
    } catch {
      setExplainResult("Could not explain. Make sure the backend is running.");
    }
    setExplainLoading(false);
  };

  const handleFlag = async () => {
    setFlagging(true);
    try {
      await api.flagTransaction(item.id);
      onUpdate();
    } catch { /* noop */ }
    setFlagging(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteTransaction(item.id);
      onClose();
      onUpdate();
    } catch { /* noop */ }
    setDeleting(false);
    setConfirmDelete(false);
  };

  return (
    <aside className="w-[360px] shrink-0">
      <div className="rounded-xl border border-slate-200 bg-white h-full flex flex-col">
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <span className="text-xs uppercase tracking-wide text-neutral-500">Transaction detail</span>
            <p className="text-sm font-semibold">{item.description}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {!editing && (
              <button onClick={() => setEditing(true)} className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-sky-600 hover:bg-sky-50">Edit</button>
            )}
            <button onClick={onClose} className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-neutral-500 hover:bg-slate-50">Close</button>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-auto px-4 py-3 text-sm">
          {editing ? (
            <section className="space-y-2">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-600">Editing</h3>
              <EditField label="Description" value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} />
              <EditField label="Amount ($)" value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} />
              <EditField label="Owner" value={draft.owner} onChange={(v) => setDraft((d) => ({ ...d, owner: v }))} />
              <EditField label="Category" value={draft.category} onChange={(v) => setDraft((d) => ({ ...d, category: v }))} />
              <EditField label="Date" value={draft.date} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} type="date" />
              <EditField label="Tags (comma-separated)" value={draft.tags} onChange={(v) => setDraft((d) => ({ ...d, tags: v }))} />
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} disabled={saving} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-neutral-600">Cancel</button>
              </div>
            </section>
          ) : (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Details</h3>
              <div className="space-y-1 text-xs">
                <DetailRow label="Date" value={fmtDate(item.date)} />
                <DetailRow label="Amount" value={`$${item.amount.toFixed(2)}`} />
                <DetailRow label="Owner" value={item.owner} />
                <DetailRow label="Category" value={item.category ?? "—"} />
                <DetailRow label="Tags" value={item.tags.join(", ") || "—"} />
              </div>
            </section>
          )}

          {item.ai_reasoning && !editing && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">AI reasoning</h3>
              <p className="text-xs text-neutral-700">{item.ai_reasoning}</p>
            </section>
          )}

          {!editing && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Actions</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleExplain} disabled={explainLoading} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                  {explainLoading ? "Loading..." : "💡 Explain"}
                </button>
                <button onClick={handleFlag} disabled={flagging || item.tags.includes("flagged")} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                  {item.tags.includes("flagged") ? "🚩 Flagged" : "🚩 Flag"}
                </button>
                <button onClick={loadHistory} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-slate-100">
                  🕑 History
                </button>
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">
                    🗑 Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={handleDelete} disabled={deleting} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                      {deleting ? "..." : "Confirm"}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-neutral-500">
                      No
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {explainResult && !editing && (
            <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-800 mb-1">Explanation</h3>
              <p className="text-xs text-neutral-700 leading-relaxed">{explainResult}</p>
            </section>
          )}

          {showHistory && !editing && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Edit history ({history.length})</h3>
              {history.length === 0 ? (
                <p className="text-xs text-neutral-400">No edits yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-neutral-400">{fmtDate(h.created_at)} · {h.edited_by}</span>
                        <button onClick={() => handleRevert(h.id)} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.6rem] text-sky-600 hover:bg-sky-50">Revert</button>
                      </div>
                      <p className="text-neutral-700">{h.snapshot.description} · ${Number(h.snapshot.amount).toFixed(2)} · {h.snapshot.owner}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ─── small helpers ─── */

function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  return dateStr.slice(0, 10);
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[0.65rem] font-medium text-neutral-500 uppercase tracking-wide">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-neutral-400" />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-900">{value}</span>
    </div>
  );
}

function ChipGroup({ label, options, value, onChange }: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-neutral-600">
      <span className="rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-medium">{label}</span>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`rounded-full px-2.5 py-0.5 ${k === value ? "bg-neutral-900 text-white" : "hover:bg-white/70"}`}>{l}</button>
      ))}
    </div>
  );
}

function categoryEmoji(category: string | null) {
  const c = (category || "").toLowerCase();
  if (c.includes("food")) return "🍜";
  if (c.includes("transport")) return "🚗";
  if (c.includes("housing") || c.includes("rent")) return "🏠";
  if (c.includes("health")) return "🩺";
  if (c.includes("entertain")) return "🎬";
  if (c.includes("education")) return "📚";
  return "💸";
}

function suggestTransactionFromHistory(description: string, history: Transaction[]) {
  const query = description.toLowerCase().trim();
  if (!query || history.length === 0) return null;

  const tokens = new Set(
    query
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
  );
  if (tokens.size === 0) return null;

  const scored = history
    .map((txn) => {
      const desc = (txn.description || "").toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (desc.includes(token)) score += 1;
      }
      return { txn, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (scored.length === 0) return null;

  const categoryCounts: Record<string, number> = {};
  const ownerCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};

  for (const { txn, score } of scored) {
    const weight = Math.max(1, score);
    const category = txn.category || "Uncategorized";
    categoryCounts[category] = (categoryCounts[category] || 0) + weight;
    ownerCounts[txn.owner] = (ownerCounts[txn.owner] || 0) + weight;
    for (const tag of txn.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + weight;
    }
  }

  const bestCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Uncategorized";
  const bestOwner = Object.entries(ownerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Household";
  const tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  return {
    owner: bestOwner,
    category: bestCategory === "Uncategorized" ? "" : bestCategory,
    tags,
    basedOn: scored.length,
  };
}
