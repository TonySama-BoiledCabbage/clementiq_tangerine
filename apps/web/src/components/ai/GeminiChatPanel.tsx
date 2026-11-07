"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send, Sparkles, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/misc";
import { EngineBadge } from "@/components/finance/EngineBadge";

interface Msg { role: "user" | "model"; content: string; meta?: ChatResponse }
interface ChatResponse {
  text: string; engine: string; model?: string; tool_calls: { name: string; ok?: boolean }[];
  citations: { headline: string; publisher: string; published: string | null; url: string }[];
  number_check?: { ok: boolean; unverified: number[] }; fallback_reason?: string; clarification?: boolean;
}

const TAG_STYLES: Record<string, string> = {
  record: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  calculated: "bg-peach text-tangerine",
  retrieved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  interpretation: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  hypothetical: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

/** Renders [calculated] / [record] / [retrieved …] / [interpretation] / [hypothetical] markers as chips. */
function Labeled({ text }: { text: string }) {
  const parts = text.split(/(\[(?:record|calculated|retrieved[^\]]*|interpretation|hypothetical)\])/gi);
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
      {parts.map((p, i) => {
        const m = p.match(/^\[(record|calculated|retrieved|interpretation|hypothetical)([^\]]*)\]$/i);
        if (!m) return <span key={i}>{p}</span>;
        const k = m[1].toLowerCase();
        return <span key={i} className={cn("mx-0.5 rounded px-1 py-px text-[10px] font-semibold uppercase", TAG_STYLES[k])}>{k}{m[2]}</span>;
      })}
    </p>
  );
}

export const SUGGESTED = [
  "How financially resilient am I?",
  "What happens if I lose my job for six months on EI?",
  "How much should I save each month?",
  "How could higher fuel prices affect me?",
  "How might an interest-rate increase affect my loan payments?",
  "Which economic developments should I watch?",
];

export function GeminiChatPanel({ accountId, compact = false, initial }: { accountId: number | null; compact?: boolean; initial?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(initial ?? "");
  const end = useRef<HTMLDivElement>(null);
  const chat = useMutation({
    mutationFn: (history: Msg[]) => api<ChatResponse>("/ai/chat", { method: "POST", json: {
      account_id: accountId, messages: history.map(({ role, content }) => ({ role, content })) } }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "model", content: r.text || "(no answer)", meta: r }]),
    onError: (e: Error) => setMsgs((m) => [...m, { role: "model", content: `Sorry — ${e.message}` }]),
  });
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, chat.isPending]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || chat.isPending) return;
    const next = [...msgs, { role: "user" as const, content: t }].slice(-20);
    setMsgs(next);
    setInput("");
    chat.mutate(next);
  };

  return (
    <div className={cn("flex flex-col", compact ? "h-full" : "h-[calc(100vh-14rem)] min-h-[480px]")}>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {!msgs.length && (
          <div className="space-y-2">
            <p className="text-xs text-ink-2">Ask about your finances, a shock, or world events. Answers label what each claim rests on.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.slice(0, compact ? 3 : 6).map((s) => (
                <button key={s} onClick={() => send(s)} className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs text-ink hover:border-tangerine hover:text-tangerine">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("rounded-2xl px-3 py-2.5", m.role === "user" ? "ml-6 bg-tangerine text-white" : "mr-2 border border-line bg-cream")}>
            {m.role === "user" ? <p className="text-[13px]">{m.content}</p> : <Labeled text={m.content} />}
            {m.meta && (
              <div className="mt-2 space-y-1.5 border-t border-line pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <EngineBadge engine={m.meta.engine} />
                  {m.meta.tool_calls.map((t, j) => <span key={j} className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-px text-[10px] text-ink-2"><Wrench className="size-2.5" />{t.name}</span>)}
                  {m.meta.number_check && !m.meta.number_check.ok && <span className="text-[10px] font-semibold text-warn">Unverified figures: {m.meta.number_check.unverified.join(", ")} — rely on the dashboards.</span>}
                </div>
                {m.meta.citations.length > 0 && (
                  <ul className="space-y-0.5">{m.meta.citations.map((c, j) => (
                    <li key={j} className="text-[11px] text-ink-2">↳ <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-tangerine">{c.headline}</a> — {c.publisher}, {c.published?.slice(0, 10)}</li>
                  ))}</ul>
                )}
              </div>
            )}
          </div>
        ))}
        {chat.isPending && <div className="flex items-center gap-2 text-xs text-ink-2"><Spinner /> Clement is checking your numbers…</div>}
        <div ref={end} />
      </div>
      <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tangerine" />
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} aria-label="Ask ClementAI"
            placeholder={accountId ? "Ask ClementAI anything…" : "Select an account first"}
            className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm focus:border-tangerine focus:outline-none focus:ring-2 focus:ring-tangerine/20" />
        </div>
        <button type="submit" disabled={!input.trim() || chat.isPending} aria-label="Send" className="brand-gradient grid size-11 cursor-pointer place-items-center rounded-xl text-white disabled:opacity-50"><Send className="size-4" /></button>
      </form>
    </div>
  );
}
