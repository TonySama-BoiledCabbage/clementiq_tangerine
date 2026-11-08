"use client";
import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export interface GlobeMarker { iso3: string; name: string; lat: number; lon: number; count: number; hasIndicators: boolean }

export function latLonToVec3(lat: number, lon: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

function Graticule() {
  const lines = useMemo(() => {
    const out: [number, number, number][][] = [];
    for (let lat = -60; lat <= 60; lat += 30) out.push(Array.from({ length: 73 }, (_, i) => latLonToVec3(lat, i * 5 - 180, 2.002)));
    for (let lon = -180; lon < 180; lon += 30) out.push(Array.from({ length: 37 }, (_, i) => latLonToVec3(i * 5 - 90, lon, 2.002)));
    return out;
  }, []);
  return <>{lines.map((pts, i) => <Line key={i} points={pts} color="#ffb27a" lineWidth={0.6} transparent opacity={0.45} />)}</>;
}

function Marker({ m, selected, onSelect }: { m: GlobeMarker; selected: boolean; onSelect: (iso3: string) => void }) {
  const [hover, setHover] = useState(false);
  const pos = latLonToVec3(m.lat, m.lon, 2.03);
  const size = 0.035 + Math.min(m.count, 20) * 0.006;
  return (
    <group position={pos}>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect(m.iso3); }} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <sphereGeometry args={[size * (hover || selected ? 1.5 : 1), 16, 16]} />
        <meshStandardMaterial color={m.count ? "#ff6b00" : "#8b5cf6"} emissive={m.count ? "#ff6b00" : "#8b5cf6"} emissiveIntensity={selected ? 0.9 : 0.4} />
      </mesh>
      {(hover || selected) && (
        <Html distanceFactor={7} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-lg bg-white px-2 py-1 text-[0.6875rem] font-semibold text-slate-900 shadow">{m.name} · {m.count} events{m.hasIndicators ? " · indicators" : ""}</div>
        </Html>
      )}
    </group>
  );
}

function Spin({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (enabled && g.current) g.current.rotation.y += dt * 0.05; });
  return <group ref={g}>{children}</group>;
}

export default function GlobeScene({ markers, selected, onSelect, autoRotate }: { markers: GlobeMarker[]; selected: string | null; onSelect: (iso3: string) => void; autoRotate: boolean }) {
  return (
    <Canvas camera={{ position: [0, 1.2, 5.4], fov: 45 }} dpr={[1, 2]} aria-label="3D globe of economic developments">
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 3, 5]} intensity={1.1} />
      <Spin enabled={autoRotate && !selected}>
        <mesh>
          <sphereGeometry args={[2, 64, 64]} />
          <meshStandardMaterial color="#fff0e5" roughness={0.9} />
        </mesh>
        <Graticule />
        {markers.map((m) => <Marker key={m.iso3} m={m} selected={selected === m.iso3} onSelect={onSelect} />)}
      </Spin>
      <OrbitControls enablePan={false} minDistance={3.2} maxDistance={9} />
    </Canvas>
  );
}
