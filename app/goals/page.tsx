"use client";

import { TopBar } from "../page";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Goal } from "@/lib/api";

export default function GoalsWikiPage() {
  const [role, setRole] = useState<"parent" | "teen" | "child">("parent");
  const [search, setSearch] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);

  const load = useCallback(async () => {
    try { setGoals(await api.getGoals()); } catch { /* API down */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = goals.filter((g) => g.status === "active");
  const archived = goals.filter((g) => g.status === "archived");

  return (
    <div className="min-h-screen">
      <TopBar activeRole={role} onRoleChange={setRole} search={search} onSearchChange={setSearch} onRunSweep={() => {}} isSweepLoading={false} />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-8 pb-8 pt-4">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">Family wiki 📘</h1>
          <p className="text-sm text-neutral-600">Every goal gets its own page — numbers, decisions, and AI history in one place.</p>
        </header>

        <main className="rounded-xl border border-slate-200 bg-white flex-1 px-4 py-4 text-sm text-neutral-700">
          {goals.length === 0 ? (
            <p className="text-center text-xs text-neutral-400 py-10">No goals loaded. Make sure the API is running.</p>
          ) : (
            <>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Active goals</div>
              <div className="grid gap-3 md:grid-cols-2 mb-6">
                {active.map((g) => (
                  <Link key={g.id} href={`/goals/${g.id}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs hover:border-neutral-400 hover:bg-white">
                    <h2 className="mb-1 text-sm font-semibold text-neutral-900">{g.icon} {g.name}</h2>
                    <p className="mb-1 text-neutral-600">{g.summary ?? "No summary yet."}</p>
                    <p className="text-neutral-500">Priority: {g.priority} · Deadline: {g.deadline}</p>
                  </Link>
                ))}
              </div>
              {archived.length > 0 && (
                <>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Archived goals</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {archived.map((g) => (
                      <Link key={g.id} href={`/goals/${g.id}`} className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs hover:border-neutral-400">
                        <h2 className="mb-1 text-sm font-semibold text-neutral-900">{g.icon} {g.name}</h2>
                        <p className="mb-1 text-neutral-600">{g.summary ?? "No summary yet."}</p>
                        <p className="text-neutral-500">Priority: {g.priority} · Status: archived</p>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
