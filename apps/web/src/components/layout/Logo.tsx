/** Original ClementIQ mark: a stylised clementine with a leaf and a rising-line segment. Not a Tangerine trademark. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="22" r="15" fill="#fff" />
      <circle cx="20" cy="22" r="12.5" fill="#FF8A24" />
      <path d="M12 26 L17 21 L21 24 L28 16" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9 C 21 4, 27 3, 30 5 C 28 9, 24 10, 20 9 Z" fill="#16A34A" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-ink"}`}>
          Clement<span className={light ? "text-white/85" : "text-tangerine"}>IQ</span>
        </div>
        <div className={`hidden whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.14em] min-[420px]:block ${light ? "text-white/80" : "text-ink-2"}`}>AI Financial Resilience</div>
      </div>
    </div>
  );
}
