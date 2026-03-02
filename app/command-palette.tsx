"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CommandResult } from "@/lib/api";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [ownerSuggestions, setOwnerSuggestions] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState<{
    proposalId: number;
    amount: string;
    description: string;
    owner: string;
    date: string;
    tags: string[];
  } | null>(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((prev) => {
        if (!prev) {
          setResult(null);
          setInput("");
          setFollowUp(null);
        }
        return !prev;
      });
    }
    if (e.key === "Escape" && open) {
      setOpen(false);
    }
  }, [open]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api.getTransactions()
      .then((txns) => {
        const owners = Array.from(new Set(txns.map((t) => t.owner))).slice(0, 8);
        const tagCounts = new Map<string, number>();
        for (const t of txns) {
          for (const tag of t.tags || []) {
            const key = String(tag).trim().toLowerCase();
            if (!key) continue;
            tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
          }
        }
        const tags = Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([tag]) => tag);
        setOwnerSuggestions(owners);
        setTagSuggestions(tags);
      })
      .catch(() => {});
  }, [open]);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.sendCommand(input.trim());
      setResult(res);
      const data = (res.data ?? {}) as Record<string, unknown>;
      if (
        (res.intent === "add_transaction" || res.intent === "edit_transaction") &&
        Boolean(data.requires_approval)
      ) {
        const proposal = (data.proposal ?? {}) as Record<string, unknown>;
        const dateIso = String(proposal.date ?? "");
        setFollowUp({
          proposalId: Number(proposal.id),
          amount: String(proposal.amount ?? ""),
          description: String(proposal.description ?? ""),
          owner: String(proposal.owner ?? ""),
          date: dateIso ? dateIso.slice(0, 10) : "",
          tags: Array.isArray(proposal.tags) ? (proposal.tags as string[]) : [],
        });
        window.dispatchEvent(new CustomEvent("familyops:proposal-created"));
      } else {
        setFollowUp(null);
      }
    } catch {
      setResult({
        intent: "error",
        parameters: {},
        confidence: 0,
        response_text: "Could not reach the AI. Make sure the backend is running.",
      });
    }
    setLoading(false);
  };

  if (!open) return null;

  const intentIcon = (intent: string) => {
    switch (intent) {
      case "add_transaction": return "💳";
      case "edit_transaction": return "✏️";
      case "what_if": return "🔮";
      case "run_sweep": return "🧹";
      case "query": return "🔍";
      case "explain": return "💡";
      case "error": return "❌";
      default: return "✨";
    }
  };

  const toggleTag = (tag: string) => {
    if (!followUp) return;
    setFollowUp((prev) => {
      if (!prev) return prev;
      const nextTags = prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag];
      return { ...prev, tags: nextTags };
    });
  };

  const applyFollowUp = async () => {
    if (!followUp) return;
    setSavingFollowUp(true);
    try {
      const payload = {
        amount: Number(followUp.amount || 0),
        description: followUp.description.trim(),
        owner: followUp.owner.trim() || "Household",
        date: followUp.date
          ? new Date(`${followUp.date}T12:00:00`).toISOString()
          : new Date().toISOString(),
        tags: followUp.tags,
      };
      await api.updateTransactionProposal(followUp.proposalId, payload);
      window.dispatchEvent(new CustomEvent("familyops:proposal-created"));
    } catch {
      /* noop */
    }
    setSavingFollowUp(false);
  };

  const intentLabel = (intent: string) => {
    switch (intent) {
      case "add_transaction": return "Add transaction";
      case "edit_transaction": return "Edit transaction";
      case "what_if": return "Scenario analysis";
      case "run_sweep": return "AI Sweep";
      case "query": return "Search";
      case "explain": return "Explain";
      case "error": return "Error";
      default: return intent;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* input */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <span className="text-neutral-400 text-sm">✨</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) handleSubmit();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Add a transaction, ask a question, run a what-if..."
            className="flex-1 text-sm outline-none bg-transparent text-neutral-900 placeholder:text-neutral-400"
            disabled={loading}
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.6rem] font-mono text-neutral-400">
            ESC
          </kbd>
        </div>

        {/* hints */}
        {!result && !loading && (
          <div className="px-5 py-3 space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-400 mb-2">Try these</p>
            {[
              { text: "Add $45 gas fill-up for Alex", icon: "💳" },
              { text: "What if we cancel Netflix and Spotify?", icon: "🔮" },
              { text: "How much did Sam spend this month?", icon: "🔍" },
              { text: "Run an AI sweep", icon: "🧹" },
            ].map((hint) => (
              <button
                key={hint.text}
                onClick={() => { setInput(hint.text); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-neutral-600 hover:bg-slate-50 transition-colors text-left"
              >
                <span>{hint.icon}</span>
                <span>{hint.text}</span>
              </button>
            ))}
          </div>
        )}

        {/* loading */}
        {loading && (
          <div className="flex items-center gap-3 px-5 py-6">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
            <span className="text-sm text-neutral-500">Thinking...</span>
          </div>
        )}

        {/* result */}
        {result && !loading && (
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base">{intentIcon(result.intent)}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.65rem] font-medium text-neutral-600">
                {intentLabel(result.intent)}
              </span>
              {result.confidence > 0 && (
                <span className="text-[0.65rem] text-neutral-400">
                  {(result.confidence * 100).toFixed(0)}% confident
                </span>
              )}
            </div>

            <p className="text-sm text-neutral-800">{result.response_text}</p>

            {result.data && result.intent === "what_if" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                {(result.data as Record<string, unknown>).scenario_summary && (
                  <p className="text-neutral-700">{(result.data as Record<string, unknown>).scenario_summary as string}</p>
                )}
                {(result.data as Record<string, unknown>).recommendation && (
                  <p className="text-emerald-700 font-medium">{(result.data as Record<string, unknown>).recommendation as string}</p>
                )}
              </div>
            )}

            {result.data && result.intent === "add_transaction" && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs">
                <p className="text-emerald-800 font-medium">Draft created. Approve or reject it in the Timeline.</p>
              </div>
            )}

            {result.data && result.intent === "edit_transaction" && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs">
                <p className="text-amber-800 font-medium">Draft edit created. Approve or reject it in the Timeline.</p>
              </div>
            )}

            {followUp && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-xs space-y-3">
                <p className="font-semibold text-sky-800">Quick confirm details</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={followUp.amount}
                    onChange={(e) => setFollowUp((p) => p ? { ...p, amount: e.target.value } : p)}
                    placeholder="Amount"
                    className="rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-xs outline-none"
                  />
                  <input
                    type="date"
                    value={followUp.date}
                    onChange={(e) => setFollowUp((p) => p ? { ...p, date: e.target.value } : p)}
                    className="rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-xs outline-none"
                  />
                </div>
                <input
                  value={followUp.description}
                  onChange={(e) => setFollowUp((p) => p ? { ...p, description: e.target.value } : p)}
                  placeholder="Description"
                  className="w-full rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-xs outline-none"
                />
                <div className="space-y-1">
                  <input
                    value={followUp.owner}
                    onChange={(e) => setFollowUp((p) => p ? { ...p, owner: e.target.value } : p)}
                    placeholder="Owner"
                    className="w-full rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-xs outline-none"
                  />
                  {ownerSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ownerSuggestions.map((owner) => (
                        <button
                          key={owner}
                          onClick={() => setFollowUp((p) => p ? { ...p, owner } : p)}
                          className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[0.65rem] text-sky-700 hover:bg-sky-100"
                        >
                          {owner}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[0.65rem] text-sky-700">Suggested tags</p>
                  <div className="flex flex-wrap gap-1">
                    {tagSuggestions.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full border px-2 py-0.5 text-[0.65rem] ${
                          followUp.tags.includes(tag)
                            ? "border-sky-400 bg-sky-200 text-sky-900"
                            : "border-sky-200 bg-white text-sky-700 hover:bg-sky-100"
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={applyFollowUp}
                    disabled={savingFollowUp}
                    className="rounded-lg bg-sky-700 px-3 py-1.5 text-[0.7rem] font-medium text-white hover:bg-sky-800 disabled:opacity-50"
                  >
                    {savingFollowUp ? "Saving..." : "Save draft details"}
                  </button>
                </div>
              </div>
            )}

            {result.data && result.intent === "run_sweep" && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-xs">
                <p className="text-sky-800 font-medium">
                  AI Sweep complete. Check the Inbox for new recommendations.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={() => { setResult(null); setInput(""); inputRef.current?.focus(); }}
                className="text-xs text-neutral-500 hover:text-neutral-800"
              >
                Ask another question
              </button>
            </div>
          </div>
        )}

        {/* footer */}
        <div className="border-t border-slate-100 px-5 py-2 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2 text-[0.6rem] text-neutral-400">
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono">⌘K</kbd>
            <span>to toggle</span>
          </div>
          <div className="flex items-center gap-2 text-[0.6rem] text-neutral-400">
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono">↵</kbd>
            <span>to submit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
