"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, type Transaction, type Goal, type TransactionProposal } from "@/lib/api";

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

  const handleRunSweep = async () => {
    setIsSweepLoading(true);
    try { await api.runAISweep(); } catch { /* noop */ }
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
          <GoalsStrip goals={activeGoals} />
          <div className="flex flex-1 gap-4">
            <div className={selectedItem ? "flex-1" : "w-full"}>
              <TimelineTable
                items={filteredTimeline}
                pendingProposals={pendingProposals}
                viewMode={viewMode}
                dateRange={dateRange}
                onChangeViewMode={setViewMode}
                onChangeDateRange={setDateRange}
                onSelect={setSelectedItem}
                onApproveProposal={handleApproveProposal}
                onRejectProposal={handleRejectProposal}
              />
            </div>
            {selectedItem && (
              <RightDrawer
                role={activeRole}
                item={selectedItem}
                onClose={() => setSelectedItem(null)}
              />
            )}
          </div>
        </main>
      </div>
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
    { href: "/goals", label: "Wiki" },
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

function GoalsStrip({ goals }: { goals: Goal[] }) {
  if (!goals.length) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Family goals</h2>
          <p className="text-base text-neutral-700">Every AI decision is measured against these first.</p>
        </div>
        <Link href="/goals" className="text-xs text-neutral-500 hover:underline">View wiki →</Link>
      </div>
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
    </section>
  );
}

/* ─── timeline table ─── */

function TimelineTable(props: {
  items: Transaction[];
  pendingProposals: TransactionProposal[];
  viewMode: TimelineViewMode;
  dateRange: DateRange;
  onChangeViewMode: (m: TimelineViewMode) => void;
  onChangeDateRange: (r: DateRange) => void;
  onSelect: (item: Transaction) => void;
  onApproveProposal: (proposalId: number) => void;
  onRejectProposal: (proposalId: number) => void;
}) {
  const {
    items,
    pendingProposals,
    viewMode,
    dateRange,
    onChangeViewMode,
    onChangeDateRange,
    onSelect,
    onApproveProposal,
    onRejectProposal,
  } = props;

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

  const Row = ({ item }: { item: Transaction }) => (
    <tr key={item.id} className="cursor-pointer border-t border-slate-100 hover:bg-sky-50/40 transition-colors" onClick={() => onSelect(item)}>
      <td className="px-4 py-2 text-xs text-neutral-500">{item.date}</td>
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
          <ChipGroup label="View" options={[["list","List"],["byTag","By tag"],["byOwner","By owner"]]} value={viewMode} onChange={(v) => onChangeViewMode(v as TimelineViewMode)} />
          <ChipGroup label="Range" options={[["this-month","Month"],["last-30","30 days"],["this-year","Year"],["all-time","All"]]} value={dateRange} onChange={(v) => onChangeDateRange(v as DateRange)} />
        </div>
      </div>
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
                  <p className="text-[0.65rem] text-neutral-400">{proposal.date || "No date"}</p>
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

function RightDrawer(props: { role: Role; item: Transaction; onClose: () => void }) {
  const { role, item, onClose } = props;
  return (
    <aside className="w-[360px] shrink-0">
      <div className="rounded-xl border border-slate-200 bg-white h-full flex flex-col">
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <span className="text-xs uppercase tracking-wide text-neutral-500">Transaction detail</span>
            <p className="text-sm font-semibold">{item.description}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-neutral-500 hover:bg-slate-50">Close</button>
        </div>
        <div className="flex-1 space-y-4 overflow-auto px-4 py-3 text-sm">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Details</h3>
            <div className="space-y-1 text-xs">
              <DetailRow label="Date" value={item.date} />
              <DetailRow label="Amount" value={`$${item.amount.toFixed(2)}`} />
              <DetailRow label="Owner" value={item.owner} />
              <DetailRow label="Category" value={item.category ?? "—"} />
              <DetailRow label="Tags" value={item.tags.join(", ") || "—"} />
              <DetailRow label="AI confidence" value={item.ai_confidence != null ? `${(item.ai_confidence * 100).toFixed(0)}%` : "—"} />
            </div>
          </section>
          {item.ai_reasoning && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">AI reasoning</h3>
              <p className="text-xs text-neutral-700">{item.ai_reasoning}</p>
            </section>
          )}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Agent panel</h3>
            <div className="grid gap-2">
              <AgentCard name="ClassifierAgent" summary={`Categorized as ${item.category ?? "unknown"} with ${((item.ai_confidence ?? 0) * 100).toFixed(0)}% confidence.`} />
              <AgentCard name="AnomalyDetector" summary="Checks for unusual merchants, amounts, or patterns." />
              <AgentCard name="GoalAdvisor" summary="Evaluates impact on family goals and suggests reallocation." />
              <AgentCard name="ScenarioPlanner" summary={`What would happen if ${role === "child" ? "we skip" : "you skip"} this next month?`} />
            </div>
          </section>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Actions</h3>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">Explain</button>
              <button className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">Flag</button>
              <button className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">Create rule</button>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

/* ─── small helpers ─── */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-900">{value}</span>
    </div>
  );
}

function AgentCard({ name, summary }: { name: string; summary: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-indigo-50/50 px-3 py-2 text-xs">
      <span className="font-semibold">{name}</span>
      <p className="text-neutral-600">{summary}</p>
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
