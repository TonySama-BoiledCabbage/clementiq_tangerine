"use client";
/**
 * Account selection.
 *  - Judges/admins: an accessible combobox that searches the WHOLE authorized dataset through
 *    GET /api/accounts/search (exact → prefix → contains, paginated). The listbox renders in a portal,
 *    so the orchard or cards can never clip or cover it.
 *  - Customers: a read-only chip for their own account (search is not available to them).
 */
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Search, UserRound, X } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { money } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { useSession } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Row { account_id: number; income_I: number | null; spending_S: number | null; buffer_B: number | null; resilience_score: number | null; months_of_data: number | null; match: string }
interface Page { query: string; total: number; limit: number; offset: number; exact_match: boolean; items: Row[]; message?: string }
const PAGE = 25;

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function useChooseAccount() {
  const setAccount = useSession((s) => s.setAccount);
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  return (id: number) => {
    const prev = useSession.getState().accountId;
    setAccount(id);
    // drop cached results for the previous account so nothing stale can flash on screen
    if (prev && prev !== id) qc.removeQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(String(prev)) });
    const p = new URLSearchParams(params.toString());
    p.set("account", String(id));
    router.replace(`${path}?${p}`, { scroll: false });
  };
}

export function AccountSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const accountId = useSession((s) => s.accountId);
  const choose = useChooseAccount();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const [width, setWidth] = useState(360);
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = useDebounced(q.trim(), 300);

  const search = useInfiniteQuery({
    queryKey: ["account-search", term],
    queryFn: ({ pageParam }) => api<Page>(`/accounts/search?q=${encodeURIComponent(term)}&limit=${PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.limit < last.total ? last.offset + last.limit : undefined),
    enabled: open,
    staleTime: 60_000,
  });
  const rows = search.data?.pages.flatMap((p) => p.items) ?? [];
  const first = search.data?.pages[0];
  const pending = q.trim() !== term || search.isFetching;

  useEffect(() => setActive(rows.length ? 0 : -1), [term, rows.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && anchor.current) setWidth(Math.max(anchor.current.offsetWidth, 300)); }, [open]);

  const select = (id: number) => {
    choose(id);
    setOpen(false);
    setQ("");
    setNote(`Now viewing account #${id}`);
    input.current?.blur();
  };

  const submitTyped = async () => {
    const t = q.trim();
    if (!/^\d+$/.test(t)) { setNote("Account IDs are numbers — type digits only, e.g. 20111."); return; }
    try {
      const r = await api<Page>(`/accounts/search?q=${t}&limit=1&offset=0`);
      if (r.exact_match) select(Number(t));
      else setNote(`No account #${t} exists in the authorized dataset.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Search failed");
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home" && open) { setActive(0); }
    else if (e.key === "End" && open) { setActive(rows.length - 1); }
    else if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); } else setQ(""); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const exactTyped = q.trim() && /^\d+$/.test(q.trim());
      // Instant exact match: if the typed id is complete, select it even before the debounce fires.
      if (exactTyped && (q.trim() !== term || !rows[active])) { void submitTyped(); return; }
      if (rows[active]) select(rows[active].account_id);
      else if (exactTyped) void submitTyped();
    }
  };

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {accountId && (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tangerine px-3 py-1.5 text-sm font-bold text-white shadow-sm" aria-live="polite">
          <UserRound className="size-4" /> Account #{accountId}
        </span>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div ref={anchor} className="relative w-full min-w-[220px] flex-1 sm:w-auto sm:min-w-[320px] sm:max-w-[440px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-500" aria-hidden />
            <input ref={input} value={q} autoFocus={autoFocus}
              onChange={(e) => { setQ(e.target.value.slice(0, 12)); setOpen(true); setNote(null); }}
              onFocus={() => setOpen(true)} onKeyDown={onKey}
              role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
              aria-activedescendant={open && active >= 0 ? `${listId}-opt-${active}` : undefined}
              aria-label="Search any authorized account ID" inputMode="numeric" autoComplete="off" spellCheck={false}
              placeholder="Search any authorized account ID..."
              className="h-11 w-full rounded-xl border-2 border-slate-300 bg-white pl-10 pr-16 text-[15px] font-medium text-slate-900 shadow-md placeholder:text-slate-500 focus:border-tangerine focus:outline-none focus:ring-4 focus:ring-tangerine/20" />
            <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {pending && open && <Loader2 className="size-4 animate-spin text-slate-500" aria-label="Searching" />}
              {q && (
                <button type="button" onClick={() => { setQ(""); setNote(null); input.current?.focus(); }} aria-label="Clear search"
                  className="grid size-8 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="size-4" /></button>
              )}
            </span>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} collisionPadding={12} style={{ width }}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => { if (anchor.current?.contains(e.target as Node)) e.preventDefault(); }}
            className="z-[70] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border-2 border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600" role="status" aria-live="polite">
              {search.isError ? "Search failed" : first ? (first.message ?? (first.total ? `${first.total.toLocaleString()} account${first.total === 1 ? "" : "s"}${term ? ` matching “${term}”` : " in the dataset"}` : `No account matches “${term}”`)) : "Searching…"}
            </div>
            <ul id={listId} role="listbox" aria-label="Accounts" className="max-h-[min(360px,55vh)] overflow-y-auto py-1">
              {search.isError && (
                <li className="px-4 py-3 text-sm text-red-700">
                  {search.error instanceof ApiError && search.error.status === 0 ? "Can’t reach the server. Check that the backend is running." : (search.error as Error).message}
                  <button className="ml-2 cursor-pointer font-semibold underline" onClick={() => search.refetch()}>Retry</button>
                </li>
              )}
              {!search.isError && first && !rows.length && (
                <li className="px-4 py-4 text-sm text-slate-600">{first.message ?? `No account ID contains “${term}” in the authorized dataset. Check the number and try again.`}</li>
              )}
              {rows.map((r, i) => (
                <li key={r.account_id} id={`${listId}-opt-${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => select(r.account_id)}
                  className={cn("flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5", i === active ? "bg-orange-50 ring-2 ring-inset ring-tangerine" : "hover:bg-slate-50",
                    r.account_id === accountId && "font-semibold")}>
                  <span className="flex items-center gap-2">
                    <span className="text-base font-bold tabular-nums">#{r.account_id}</span>
                    {r.match === "exact" && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">exact match</span>}
                    {r.account_id === accountId && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">current</span>}
                  </span>
                  <span className="text-right text-xs text-slate-600">income {money(r.income_I)} · buffer {money(r.buffer_B)}</span>
                </li>
              ))}
            </ul>
            {search.hasNextPage && (
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => search.fetchNextPage()} disabled={search.isFetchingNextPage}
                className="w-full cursor-pointer border-t border-slate-200 bg-slate-50 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50">
                {search.isFetchingNextPage ? "Loading…" : `Show more (${rows.length.toLocaleString()} of ${first?.total.toLocaleString()})`}
              </button>
            )}
            <p className="border-t border-slate-200 px-4 py-1.5 text-[11px] text-slate-500">↑↓ to move · Enter to open · Esc to close</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {note && <p className="w-full text-xs font-medium text-ink-2" role="status">{note}</p>}
    </div>
  );
}

/** Account picker for any page: search for judges/admins, read-only chip for customers. */
export function CustomerSelector({ className }: { className?: string; compact?: boolean }) {
  const me = useMe();
  const accountId = useSession((s) => s.accountId);
  if (!me.data) return <div className="h-11 w-72 animate-pulse rounded-xl bg-peach" />;
  if (!me.data.entitlements.account_search) {
    return (
      <span className={cn("inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800", className)}>
        <Lock className="size-4 text-slate-500" /> Your account #{me.data.account_id ?? accountId}
      </span>
    );
  }
  return <AccountSearch className={className} />;
}
