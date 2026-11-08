"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";
const subscribe = () => () => {};

/** Manual browser speech only: no model, external TTS, autoplay or balance masking. */
export function ReadAloud({ text }: { text: string }) {
  const supported = useSyncExternalStore(subscribe, () => typeof window !== "undefined" && "speechSynthesis" in window, () => false);
  const [speaking, setSpeaking] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => () => { if (utterance.current) window.speechSynthesis.cancel(); }, [text]);
  if (!supported) return null;
  const toggle = () => {
    if (speaking) { window.speechSynthesis.cancel(); utterance.current = null; setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-CA";
    u.onend = u.onerror = () => { utterance.current = null; setSpeaking(false); };
    window.speechSynthesis.cancel();
    utterance.current = u;
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  return <button type="button" onClick={toggle} aria-pressed={speaking} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-cream px-3 text-xs font-medium text-ink">{speaking ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}<span>{speaking ? "Stop reading" : "Read aloud"}</span></button>;
}

export function Glossary() {
  return <details className="rounded-2xl bg-surface px-5"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">What these terms mean</summary><dl className="grid gap-3 pb-5 text-sm sm:grid-cols-2">{[
    ["Typical month", "The median of recorded months; individual months can differ."],
    ["Buffer", "The average daily account balance across the last six recorded months."],
    ["Runway", "How long that buffer could cover a monthly income shortfall under the stated assumptions."],
    ["Fixed payments", "Known standing orders and payments on a running loan. Due dates and other accounts are not available."],
    ["Goal Plan", "A calculated savings target and contribution estimate, not an automatic bank transfer."],
    ["Backup Plan", "Possible responses to the currently selected shock, not a guarantee of future outcomes."],
  ].map(([term, meaning]) => <div key={term}><dt className="font-semibold">{term}</dt><dd className="mt-1 leading-relaxed text-ink-2">{meaning}</dd></div>)}</dl></details>;
}
