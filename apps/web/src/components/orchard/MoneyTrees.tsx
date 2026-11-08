"use client";
/** Layer 2 — foreground money trees: tangerines, hanging bills, coins and earned golden fruit. */
import { memo, useMemo } from "react";
import type { Growth } from "@/lib/growth";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TreeSpec { cx: number; cy: number; w: number; h: number; trunkX: number; seed: number; flip?: boolean }

const TREES: TreeSpec[] = [
  { cx: 150, cy: 150, w: 330, h: 250, trunkX: 120, seed: 7 },
  { cx: 1500, cy: 200, w: 260, h: 220, trunkX: 1530, seed: 19, flip: true },
];

function Tree({ t, growth, bills, coins }: { t: TreeSpec; growth: Growth; bills: boolean; coins: boolean }) {
  const parts = useMemo(() => {
    const r = rng(t.seed);
    const blobs = Array.from({ length: 16 + Math.round(growth.fullness * 10) }, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      return { x: t.cx + Math.cos(a) * d * t.w * 0.5, y: t.cy + Math.sin(a) * d * t.h * 0.42, r: 38 + r() * 34 * (0.8 + growth.fullness * 0.35), c: r() };
    });
    const spots = Array.from({ length: 40 }, () => {
      const a = r() * Math.PI * 2, d = 0.25 + Math.sqrt(r()) * 0.7;
      return { x: t.cx + Math.cos(a) * d * t.w * 0.48, y: t.cy + Math.sin(a) * d * t.h * 0.4 + 10, s: r() };
    });
    return { blobs, spots };
  }, [t, growth.fullness]);

  const nFruit = 6 + Math.round(growth.fruit * 16);
  const fruit = parts.spots.slice(0, nFruit);
  const billSpots = bills ? parts.spots.slice(24, 28) : [];
  const coinSpots = coins ? parts.spots.slice(30, 35) : [];
  const goldSpots = parts.spots.slice(36, 36 + Math.min(growth.golden, 3));

  return (
    <g>
      <path d={`M${t.trunkX - 16} 610 C ${t.trunkX - 10} 480, ${t.trunkX + (t.flip ? -40 : 40)} 330, ${t.cx} ${t.cy + 40} L ${t.cx + 14} ${t.cy + 48} C ${t.trunkX + (t.flip ? -20 : 60)} 340, ${t.trunkX + 18} 480, ${t.trunkX + 22} 610 Z`} fill="#6b4226" />
      <g className="anim-sway">
        {parts.blobs.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.c < 0.33 ? "#2f6a2c" : b.c < 0.66 ? "#3f7d34" : "#4f9a3f"} />
        ))}
        {parts.blobs.slice(0, 8).map((b, i) => <circle key={`h${i}`} cx={b.x - b.r * 0.25} cy={b.y - b.r * 0.3} r={b.r * 0.45} fill="#6db354" opacity="0.35" />)}
        {fruit.map((f, i) => {
          const rr = 12 + f.s * 6;
          return (
            <g key={`f${i}`}>
              <circle cx={f.x} cy={f.y} r={rr} fill="url(#tangerine)" />
              <ellipse cx={f.x - rr * 0.35} cy={f.y - rr * 0.4} rx={rr * 0.28} ry={rr * 0.18} fill="#fff" opacity="0.45" />
              <path d={`M${f.x} ${f.y - rr} q 6 -8 14 -6 q -6 8 -14 6`} fill="#3f8a34" />
            </g>
          );
        })}
        {goldSpots.map((g, i) => (
          <g key={`g${i}`}>
            <circle className="anim-glow" cx={g.x} cy={g.y} r={28} fill="url(#goldGlow)" />
            <circle cx={g.x} cy={g.y} r={15} fill="url(#golden)" stroke="#fff3b0" strokeWidth="1.5" />
          </g>
        ))}
        {coinSpots.map((c, i) => (
          <g key={`c${i}`}>
            <circle cx={c.x} cy={c.y + 18} r={9} fill="url(#coin)" stroke="#b07d10" strokeWidth="1" />
            <circle cx={c.x} cy={c.y + 18} r={5.5} fill="none" stroke="#fff1a8" strokeWidth="1" opacity="0.8" />
          </g>
        ))}
      </g>
      {billSpots.map((b, i) => (
        <g key={`b${i}`} className="anim-swing" style={{ animationDelay: `${i * 0.7}s` }}>
          <line x1={b.x} y1={b.y} x2={b.x} y2={b.y + 18} stroke="#5a3a1f" strokeWidth="1.2" />
          <g transform={`translate(${b.x - 20} ${b.y + 18}) rotate(${(b.s - 0.5) * 16} 20 11)`}>
            <rect width="40" height="22" rx="3" fill="#8fcf87" stroke="#3f8a3a" strokeWidth="1.2" />
            <rect x="4" y="4" width="32" height="14" rx="2" fill="none" stroke="#3f8a3a" strokeWidth="0.8" opacity="0.7" />
            <text x="20" y="15.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#2e6b2b">$</text>
          </g>
        </g>
      ))}
    </g>
  );
}

function MoneyTreesImpl({ growth, bills, coins }: { growth: Growth; bills: boolean; coins: boolean }) {
  return (
    <svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="tangerine" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stopColor="#ffc06a" /><stop offset="0.6" stopColor="#ff8a1f" /><stop offset="1" stopColor="#e2620a" /></radialGradient>
        <radialGradient id="golden" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stopColor="#fff6c2" /><stop offset="0.55" stopColor="#ffd34d" /><stop offset="1" stopColor="#e0a400" /></radialGradient>
        <radialGradient id="goldGlow"><stop offset="0" stopColor="#fff2a0" stopOpacity="0.9" /><stop offset="1" stopColor="#ffd34d" stopOpacity="0" /></radialGradient>
        <radialGradient id="coin" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stopColor="#fff0a0" /><stop offset="1" stopColor="#d9a520" /></radialGradient>
      </defs>
      {TREES.map((t) => <Tree key={t.seed} t={t} growth={growth} bills={bills} coins={coins} />)}
    </svg>
  );
}

export const MoneyTrees = memo(MoneyTreesImpl);
