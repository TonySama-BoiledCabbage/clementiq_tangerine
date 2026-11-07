"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { Skeleton } from "@/components/ui/misc";
import type { GlobeMarker } from "./GlobeScene";

const GlobeScene = dynamic(() => import("./GlobeScene"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

/** 2D equirectangular fallback (no coastlines are drawn: we only plot positions we actually have). */
function FlatMap({ markers, selected, onSelect }: { markers: GlobeMarker[]; selected: string | null; onSelect: (iso3: string) => void }) {
  const x = (lon: number) => ((lon + 180) / 360) * 720;
  const y = (lat: number) => ((90 - lat) / 180) * 360;
  return (
    <svg viewBox="0 0 720 360" className="h-full w-full rounded-2xl bg-peach" role="img" aria-label="Flat map of economic developments">
      {[-60, -30, 0, 30, 60].map((lat) => <line key={lat} x1={0} x2={720} y1={y(lat)} y2={y(lat)} stroke="#ffb27a" strokeOpacity={0.5} strokeWidth={0.6} />)}
      {Array.from({ length: 12 }, (_, i) => i * 30 - 180).map((lon) => <line key={lon} y1={0} y2={360} x1={x(lon)} x2={x(lon)} stroke="#ffb27a" strokeOpacity={0.5} strokeWidth={0.6} />)}
      {markers.map((m) => (
        <g key={m.iso3} onClick={() => onSelect(m.iso3)} className="cursor-pointer" role="button" aria-label={`${m.name}: ${m.count} events`} tabIndex={0}
           onKeyDown={(e) => e.key === "Enter" && onSelect(m.iso3)}>
          <circle cx={x(m.lon)} cy={y(m.lat)} r={14} fill="transparent" />
          <circle cx={x(m.lon)} cy={y(m.lat)} r={4 + Math.min(m.count, 20) * 0.4} fill={m.count ? "#ff6b00" : "#8b5cf6"} stroke="#fff" strokeWidth={2} opacity={selected && selected !== m.iso3 ? 0.5 : 1} />
          <text x={x(m.lon) + 9} y={y(m.lat) + 4} fontSize={10} fill="#64748b">{m.iso3}</text>
        </g>
      ))}
    </svg>
  );
}

export function GlobalEventsMap({ markers, selected, onSelect, prefer3d = true }: { markers: GlobeMarker[]; selected: string | null; onSelect: (iso3: string) => void; prefer3d?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [webgl, setWebgl] = useState(true);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  useEffect(() => {
    try { const c = document.createElement("canvas"); setWebgl(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setWebgl(false); }
  }, []);
  const use3d = prefer3d && webgl && mode === "3d";
  return (
    <div className="relative h-[420px] w-full">
      {use3d ? <GlobeScene markers={markers} selected={selected} onSelect={onSelect} autoRotate={!reduced} /> : <FlatMap markers={markers} selected={selected} onSelect={onSelect} />}
      <div className="absolute right-3 top-3 flex gap-1 rounded-xl bg-surface/90 p-1 text-[11px] font-semibold shadow">
        {(["3d", "2d"] as const).map((m) => (
          <button key={m} disabled={m === "3d" && !webgl} onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`cursor-pointer rounded-lg px-2 py-1 ${mode === m ? "bg-peach text-tangerine" : "text-ink-2"} disabled:opacity-40`}>{m.toUpperCase()}</button>
        ))}
      </div>
    </div>
  );
}
