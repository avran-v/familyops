"use client";

import { TopBar } from "../../page";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Goal } from "@/lib/api";

export default function GoalDetailPage() {
  const params = useParams();
  const goalId = Number(params.id);
  const [role, setRole] = useState<"parent" | "teen" | "child">("parent");
  const [search, setSearch] = useState("");
  const [goal, setGoal] = useState<Goal | null>(null);

  const load = useCallback(async () => {
    try {
      const goals = await api.getGoals();
      setGoal(goals.find((g) => g.id === goalId) ?? null);
    } catch { /* API down */ }
  }, [goalId]);

  useEffect(() => { load(); }, [load]);

  const pct = goal && goal.target_amount > 0
    ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
    : 0;

  return (
    <div className="min-h-screen">
      <TopBar activeRole={role} onRoleChange={setRole} search={search} onSearchChange={setSearch} onRunSweep={() => {}} isSweepLoading={false} />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-8 pb-8 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              {goal ? `${goal.icon} ${goal.name}` : "Loading…"}
            </h1>
            <p className="text-sm text-neutral-600">{goal?.summary ?? ""}</p>
          </div>
          <Link href="/goals" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-slate-50">← Back to wiki</Link>
        </header>

        {goal && (
          <main className="rounded-xl border border-slate-200 bg-white flex-1 px-5 py-4 text-sm text-neutral-700 space-y-5">
            {/* overview */}
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Overview</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <DetailRow label="Status" value={goal.status} />
                <DetailRow label="Priority" value={goal.priority} />
                <DetailRow label="Deadline" value={goal.deadline} />
                <DetailRow label="Created" value={goal.created_at} />
              </div>
            </section>

            {/* progress */}
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Funding progress</h2>
              <div className="mb-1 flex items-center justify-between text-xs text-neutral-600">
                <span>${goal.current_amount.toLocaleString()} of ${goal.target_amount.toLocaleString()}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400" style={{ width: `${pct}%` }} />
              </div>
            </section>

            {/* AI insights placeholder */}
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">AI summary &amp; recommendations</h2>
              <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-neutral-700">
                <p className="mb-1 font-medium text-sky-800">Auto-generated after each AI sweep:</p>
                <ul className="list-disc pl-4 text-neutral-600">
                  <li>Plain-language summary of how this goal is tracking.</li>
                  <li>2–3 concrete suggestions the family can act on this week.</li>
                  <li>Links to past decisions that made a difference for this goal.</li>
                </ul>
              </div>
            </section>

            {/* related decisions */}
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Related decisions &amp; history</h2>
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-neutral-600">
                Once the ledger is wired, this section will show every decision that helped or hurt this goal. This also feeds the RAG layer so agents can reference past outcomes.
              </div>
            </section>
          </main>
        )}
      </div>
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
