"use client";
/** Layer 1 — golden-hour sky, sun, rolling hills and distant orchard rows. Static and memoised. */
import { memo, useMemo } from "react";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** y of the mid hill crest at x (matches the hill path below). */
function hillY(x: number) {
  return 392 - 34 * Math.sin((x / 1600) * Math.PI * 1.6 + 0.4) - 14 * Math.sin((x / 1600) * Math.PI * 4.2);
}

function OrchardBackgroundImpl() {
  const rows = useMemo(() => {
    const r = rng(42);
    const out: { x: number; y: number; s: number; fruit: number[] }[] = [];
    for (let row = 0; row < 6; row++) {
      const depth = row / 5;                       // 0 far → 1 near
      const s = 7 + depth * 15;
      const step = 26 + depth * 44;
      for (let x = -20 + (row % 2) * step * 0.5; x < 1620; x += step) {
        const y = hillY(x) + 14 + row * (16 + depth * 20) + r() * 3;
        const n = 1 + Math.floor(r() * (2 + depth * 3));
        out.push({ x: x + r() * 6, y, s, fruit: Array.from({ length: n }, () => r()) });
      }
    }
    return out;
  }, []);

  return (
    <svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a99be0" />
          <stop offset="0.32" stopColor="#e9b3d0" />
          <stop offset="0.55" stopColor="#ffc9a8" />
          <stop offset="0.72" stopColor="#ffe0a8" />
        </linearGradient>
        <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6d6" stopOpacity="1" />
          <stop offset="0.35" stopColor="#ffd59a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb36b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c4a0c6" /><stop offset="1" stopColor="#b48fb0" /></linearGradient>
        <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a7b46a" /><stop offset="1" stopColor="#6f8f3c" /></linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7f9b44" /><stop offset="1" stopColor="#4e6d2a" /></linearGradient>
        <radialGradient id="warm" cx="0.78" cy="0.58" r="0.75">
          <stop offset="0" stopColor="#ffb25e" stopOpacity="0.38" />
          <stop offset="1" stopColor="#ff8a24" stopOpacity="0" />
        </radialGradient>
        <filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <rect width="1600" height="600" fill="url(#sky)" />
      <g opacity="0.5" filter="url(#soft)">
        <ellipse cx="320" cy="120" rx="210" ry="26" fill="#fff" />
        <ellipse cx="820" cy="80" rx="260" ry="22" fill="#fff" />
        <ellipse cx="1180" cy="170" rx="200" ry="18" fill="#ffe9f1" />
      </g>
      <circle className="anim-sun" cx="1255" cy="338" r="250" fill="url(#sunGlow)" />
      <circle cx="1255" cy="338" r="40" fill="#fff4cf" />
      <path d="M0 360 C 200 300, 380 330, 560 318 S 940 290, 1120 322 S 1420 300, 1600 330 L1600 600 L0 600Z" fill="url(#hillFar)" opacity="0.75" />
      <path d={`M0 ${hillY(0)} ${Array.from({ length: 33 }, (_, i) => `L${i * 50} ${hillY(i * 50).toFixed(1)}`).join(" ")} L1600 600 L0 600Z`} fill="url(#hillMid)" />
      <rect y="470" width="1600" height="130" fill="url(#ground)" opacity="0.55" />
      {rows.map((t, i) => (
        <g key={i}>
          <ellipse cx={t.x} cy={t.y + t.s * 0.75} rx={t.s * 1.05} ry={t.s * 0.28} fill="#3d5a22" opacity="0.35" />
          <ellipse cx={t.x} cy={t.y} rx={t.s} ry={t.s * 0.82} fill={i % 3 ? "#3f7a33" : "#4c8c3a"} />
          {t.fruit.map((f, j) => (
            <circle key={j} cx={t.x + (f - 0.5) * t.s * 1.3} cy={t.y + ((j * 37) % 10 - 5) * t.s * 0.08} r={Math.max(1.4, t.s * 0.16)} fill="#ff8a1f" />
          ))}
        </g>
      ))}
      <rect width="1600" height="600" fill="url(#warm)" />
    </svg>
  );
}

export const OrchardBackground = memo(OrchardBackgroundImpl);
