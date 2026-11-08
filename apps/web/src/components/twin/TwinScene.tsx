"use client";
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { money } from "@/lib/format";

export interface TwinPoint { label: string; balance: number; income: number; spending: number; kind: "history" | "baseline" | "shock" }

/**
 * Each bar's height is the real (or Clement Core–projected) balance for that month, scaled linearly.
 * Thin columns behind show income (blue) and spending (orange). Planes mark $0 and the emergency target.
 */
export default function TwinScene({ points, target, selected, onSelect }: { points: TwinPoint[]; target: number; selected: number; onSelect: (i: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.balance)), target, ...points.map((p) => Math.max(p.income, p.spending)));
  const scale = 4 / maxAbs;
  const gap = 0.32;
  const width = points.length * gap;
  const x0 = -width / 2;
  const color = (p: TwinPoint) => (p.balance < 0 ? "#dc2626" : p.kind === "history" ? "#16a34a" : p.kind === "shock" ? "#ff6b00" : "#8b5cf6");
  const idx = hover ?? selected;
  const pt = points[idx];
  return (
    <Canvas camera={{ position: [0, 4, 9], fov: 45 }} dpr={[1, 2]} aria-label="3D financial digital twin">
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 8, 6]} intensity={1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[width + 2, 3]} />
        <meshStandardMaterial color="#fff0e5" transparent opacity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, target * scale, 0]}>
        <planeGeometry args={[width + 2, 3]} />
        <meshStandardMaterial color="#16a34a" transparent opacity={0.08} />
      </mesh>
      <Html position={[x0 - 0.6, target * scale, 0]} center><span className="whitespace-nowrap rounded bg-white/90 px-1.5 text-[0.625rem] text-green-700">Emergency target {money(target)}</span></Html>
      <Html position={[x0 - 0.6, 0, 0]} center><span className="whitespace-nowrap rounded bg-white/90 px-1.5 text-[0.625rem] text-red-700">$0 risk line</span></Html>
      {points.map((p, i) => {
        const h = Math.max(Math.abs(p.balance) * scale, 0.02);
        const y = p.balance >= 0 ? h / 2 : -h / 2;
        const x = x0 + i * gap;
        const active = i === idx;
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh position={[0, y, 0]} onPointerOver={(e) => { e.stopPropagation(); setHover(i); }} onPointerOut={() => setHover(null)} onClick={(e) => { e.stopPropagation(); onSelect(i); }}>
              <boxGeometry args={[0.22, h, 0.22]} />
              <meshStandardMaterial color={color(p)} emissive={active ? color(p) : "#000"} emissiveIntensity={active ? 0.45 : 0} />
            </mesh>
            <mesh position={[0, (p.income * scale) / 2, -0.35]}><boxGeometry args={[0.06, Math.max(p.income * scale, 0.01), 0.06]} /><meshStandardMaterial color="#2a78d6" transparent opacity={0.7} /></mesh>
            <mesh position={[0.08, (p.spending * scale) / 2, -0.35]}><boxGeometry args={[0.06, Math.max(p.spending * scale, 0.01), 0.06]} /><meshStandardMaterial color="#e8590c" transparent opacity={0.7} /></mesh>
          </group>
        );
      })}
      {pt && (
        <Html position={[x0 + idx * gap, Math.max(pt.balance * scale, 0) + 0.6, 0]} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-xl bg-white px-2.5 py-1.5 text-[0.6875rem] text-slate-900 shadow-lg">
            <b>{pt.label}</b> · {pt.kind === "history" ? "actual" : pt.kind === "shock" ? "shock projection" : "baseline projection"}<br />
            Balance {money(pt.balance)} · in {money(pt.income)} · out {money(pt.spending)}
          </div>
        </Html>
      )}
      <OrbitControls enablePan minDistance={4} maxDistance={18} />
    </Canvas>
  );
}
