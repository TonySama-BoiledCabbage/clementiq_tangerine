"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Lock, Search, Shuffle } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/store";
import { Button } from "@/components/ui/button";

interface AccountRow { account_id: number; income_I: number | null; buffer_B: number | null; resilience_score: number | null }

export function CustomerSelector({ compact = false, autoFocus = false, destination }: { compact?: boolean; autoFocus?: boolean; destination?: string }) {
  const { accountId, setAccount, role } = useSession();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(8);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const box = useRef<HTMLDivElement>(null);
  const list = useQuery({
    queryKey: ["account-search", q, limit],
    queryFn: () => api<{ total: number; items: AccountRow[] }>(`/accounts/search?limit=${limit}&q=${encodeURIComponent(q)}`),
    enabled: open && role !== "customer",
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const choose = (id: number) => {
    setAccount(id);
    setOpen(false);
    setQ("");
    const p = new URLSearchParams(params.toString());
    p.set("account", String(id));
    router.replace(`${destination ?? path}?${p}`);
  };

  const random = async () => {
    const total = (await api<{ total: number }>("/accounts?limit=1")).total;
    const r = await api<{ items: AccountRow[] }>(`/accounts?limit=1&offset=${Math.floor(Math.random() * total)}`);
    if (r.items[0]) choose(r.items[0].account_id);
  };

  if (role === "customer") {
    return <div className="flex items-center gap-2 rounded-md bg-field px-3 py-2 text-[15px]"><Lock className="size-4 text-ink-3" /> Account <b>{accountId}</b></div>;
  }

  return (
    <div ref={box} className={`relative flex items-center gap-2 ${compact ? "" : "w-full sm:w-auto"}`}>
      <form className="relative flex-1 sm:w-80" onSubmit={(e) => { e.preventDefault(); if (/^\d+$/.test(q)) choose(Number(q)); }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => { setQ(e.target.value.replace(/\D/g, "").slice(0, 8)); setLimit(8); setOpen(true); }} onFocus={() => { if (!autoFocus) setOpen(true); }} onClick={() => setOpen(true)}
          inputMode="numeric" aria-label="Enter account_id" autoFocus={autoFocus}
          placeholder={accountId ? `Account ${accountId} — type another account_id` : "Enter any account_id (e.g. 20111)"}
          className="h-11 w-full rounded-md border-0 bg-field pl-9 pr-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-tangerine/40" />
        {open && (
          <ul className="glass absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl" aria-label="Matching accounts">
            {list.isLoading && <li className="p-3 text-xs text-ink-2">Searching…</li>}
            {list.data?.items.map((a) => (
              <li key={a.account_id}>
                <button type="button" onClick={() => choose(a.account_id)} className="flex min-h-11 w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm hover:bg-peach">
                  <span className="font-semibold">#{a.account_id}</span>
                  <span className="text-xs text-ink-2">income {money(a.income_I)} · buffer {money(a.buffer_B)}</span>
                </button>
              </li>
            ))}
            {list.error && <li role="alert" className="p-3 text-xs text-bad">Search failed. Try again.</li>}
            {list.data && list.data.total > list.data.items.length && <li><button type="button" onClick={() => setLimit((n) => Math.min(n + 20, 200))} disabled={limit >= 200 || list.isFetching} className="min-h-11 w-full cursor-pointer px-3 text-sm text-tangerine">Show more ({list.data.total} matches)</button></li>}
            {list.data && !list.data.items.length && <li className="p-3 text-xs text-ink-2">No account matches “{q}”.</li>}
          </ul>
        )}
      </form>
      <Button type="button" variant="outline" size="icon" onClick={random} title="Pick a random account" aria-label="Pick a random account"><Shuffle /></Button>
    </div>
  );
}
