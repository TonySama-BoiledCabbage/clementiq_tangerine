"use client";
/** Accessibility & Comfort building blocks: read-aloud, Simple Mode summaries/definitions, calm wording. */
import { useEffect, useState } from "react";
import { Pause, Volume2 } from "lucide-react";
import type { Summary } from "@clementiq/shared-types";
import { money, speakable } from "@/lib/format";
import { useComfort } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Manual read-aloud via the browser's speech synthesis. Never speaks automatically; amounts are replaced
 *  with "an amount" unless the user enabled "Read amounts aloud". Hidden unless read-aloud is turned on. */
export function ReadAloud({ text, label = "Read aloud", className }: { text: string; label?: string; className?: string }) {
  const c = useComfort();
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => { if (supported && speaking) window.speechSynthesis.cancel(); }, [supported, speaking]);
  if (!c.read_aloud || !supported) return null;
  const toggle = () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(speakable(text, c.read_amounts && !c.mask));
    u.lang = "en-CA";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking}
      className={cn("inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-tangerine", className)}>
      {speaking ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />} {speaking ? "Stop reading" : label}
    </button>
  );
}

/** In Simple Mode, secondary detail is folded away behind a clear "Show more detail" control. */
export function SimpleCollapse({ title = "More detail", children }: { title?: string; children: React.ReactNode }) {
  const c = useComfort();
  if (!c.simple_mode) return <>{children}</>;
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">Show {title.toLowerCase()}</summary>
      <div className="mt-4 space-y-6">{children}</div>
    </details>
  );
}

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "Income", meaning: "Money coming into the account in a typical month (the middle value of all months)." },
  { term: "Spending", meaning: "Money going out of the account in a typical month." },
  { term: "Fixed costs", meaning: "Bills you must pay each month: household bills, insurance and loan payments." },
  { term: "Buffer", meaning: "Savings you could fall back on: the average balance over the last six months." },
  { term: "Shortfall", meaning: "How much more goes out than comes in each month." },
  { term: "Runway", meaning: "How many months the buffer would last if the shortfall continued." },
  { term: "Emergency fund", meaning: "Savings set aside for surprises, usually three months of spending." },
];

export function Glossary() {
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">What do these words mean?</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {GLOSSARY.map((g) => (
          <div key={g.term} className="rounded-xl bg-cream p-3"><dt className="text-sm font-semibold text-ink">{g.term}</dt><dd className="text-sm text-ink-2">{g.meaning}</dd></div>
        ))}
      </dl>
    </details>
  );
}

/** A short, plain-language summary of the customer's position (Simple Mode, read-aloud friendly). */
export function plainSummaryText(s: Summary, calm: boolean): string {
  const j = s.judging;
  const gap = j.S - j.I;
  const parts = [
    `In a typical month, ${money(j.I)} comes in and ${money(j.S)} goes out.`,
    gap > 0
      ? `That is ${money(gap)} more going out than coming in, so savings of ${money(j.B)} would last about ${j.runway.display} months.`
      : `Money coming in covers spending, so savings of ${money(j.B)} are not being drawn down.`,
    j.P > 0 ? `There is a loan payment of ${money(j.P)} each month.` : "There is no running loan.",
  ];
  if (gap > 0) parts.push(calm ? "A small, steady change to spending can make a real difference here." : "Reducing spending or building savings would lengthen the runway.");
  return parts.join(" ");
}

export function PlainSummary({ summary }: { summary: Summary }) {
  const c = useComfort();
  if (!c.simple_mode) return null;
  const text = plainSummaryText(summary, c.calm_mode);
  return (
    <section aria-labelledby="plain-summary" className="space-y-3 rounded-3xl border-2 border-tangerine/40 bg-peach/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plain-summary" className="text-lg font-bold text-ink">In plain words</h2>
        <ReadAloud text={text} />
      </div>
      <p className="text-base leading-relaxed text-ink">{text}</p>
      <Glossary />
    </section>
  );
}

/** Calm Mode wording for verdicts and severity labels: supportive tone, same information. */
export function calmVerdict(text: string, survives: boolean, calm: boolean): string {
  if (!calm || survives) return text;
  return text.replace(/^No —/, "Not quite yet —");
}

export function calmSeverity(s: "low" | "medium" | "high", calm: boolean): string {
  if (!calm) return s === "high" ? "High" : s === "medium" ? "Medium" : "Low";
  return s === "high" ? "Needs attention" : s === "medium" ? "Worth a look" : "For your information";
}
