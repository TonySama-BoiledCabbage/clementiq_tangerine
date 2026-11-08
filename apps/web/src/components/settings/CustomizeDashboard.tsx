"use client";
import { useMemo, useState } from "react";
import { GripVertical, RotateCcw, Search, Star, ToggleRight, EyeOff } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORIES, DEFAULT_DASHBOARD, FEATURES, available, homeFeatures, isDefaultOn, isVisible, presetVisibility, reorderedIds, toggledFavorites, type Feature } from "@/lib/features";
import { useSettings, useUpdatePrefs, useVerifiedRole } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import { FeatureIllustration } from "@/components/home/Illustrations";
import type { Density } from "@/components/home/FeatureCard";

const DENSITY: { id: Density; name: string; desc: string; cols: number }[] = [
  { id: "minimal", name: "Minimal", desc: "Larger cards, lots of space", cols: 3 },
  { id: "balanced", name: "Balanced", desc: "The standard layout", cols: 4 },
  { id: "compact", name: "Compact", desc: "More tools per screen", cols: 6 },
];

function SortRow({ f, fav }: { f: Feature; fav: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-1.5", isDragging && "z-10 shadow-lg")}>
      <button type="button" {...attributes} {...listeners} aria-label={`Drag to reorder ${f.name}`} className="grid size-8 cursor-grab touch-none place-items-center rounded-lg text-ink-3 hover:bg-peach active:cursor-grabbing"><GripVertical className="size-4" /></button>
      <FeatureIllustration id={f.id} size={22} />
      <span className="flex-1 truncate text-sm font-medium">{f.name}</span>
      {fav && <Star className="size-3.5 text-tangerine" fill="currentColor" aria-label="favorite" />}
    </li>
  );
}

export function CustomizeDashboard() {
  const role = useVerifiedRole();   // server-verified: restricted tools only appear when entitled
  const settings = useSettings();
  const update = useUpdatePrefs();
  const [q, setQ] = useState("");
  const dash = settings.data?.preferences.dashboard ?? DEFAULT_DASHBOARD;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const shown = homeFeatures(dash, role);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return FEATURES.filter((f) => available(f, role) && (!t || `${f.name} ${f.description}`.toLowerCase().includes(t)));
  }, [q, role]);

  if (!settings.data) return <Skeleton className="h-96" />;
  const setFeatures = (features: Record<string, boolean>) => update.mutate({ dashboard: { features } });
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids: string[] = shown.map((f) => f.id);
    update.mutate({ dashboard: { order: reorderedIds(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))), dash, role) } });
  };
  const density = DENSITY.find((d) => d.id === dash.layout_density) ?? DENSITY[1];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features…" aria-label="Search features"
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm focus:border-tangerine focus:outline-none focus:ring-2 focus:ring-tangerine/20" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setFeatures(presetVisibility("all", role))}><ToggleRight /> Enable All</Button>
        <Button variant="outline" size="sm" onClick={() => setFeatures(presetVisibility("essentials", role))}><EyeOff /> Hide Optional Features</Button>
        <Button variant="outline" size="sm" onClick={() => update.mutate({ dashboard: { features: presetVisibility("defaults", role), order: [], favorites: [], layout_density: "balanced" } })}><RotateCcw /> Restore Default Layout</Button>
      </div>
      <p className="text-xs text-ink-2">Changes save automatically to your account. Hiding a tool never deletes its data or stops background services, and you can turn it back on at any time.</p>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {CATEGORIES.map((c) => {
            const list = matches.filter((f) => f.category === c.id);
            if (!list.length) return null;
            const allOn = list.every((f) => isVisible(f, dash, role));
            return (
              <Card key={c.id} className="p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><p className="font-semibold text-ink">{c.name}</p><p className="text-xs text-ink-2">{c.blurb}</p></div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink-2">{allOn ? "All on" : "Turn all on"}
                    <Switch checked={allOn} onCheckedChange={(v) => setFeatures(Object.fromEntries(list.map((f) => [f.id, v])))} aria-label={`Show all ${c.name} features`} /></label>
                </div>
                <ul className="divide-y divide-line">
                  {list.map((f) => {
                    const on = isVisible(f, dash, role);
                    const fav = dash.favorites.includes(f.id);
                    return (
                      <li key={f.id} className="flex items-center gap-3 py-2.5">
                        <FeatureIllustration id={f.id} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">{f.name}
                            {isDefaultOn(f, role) && <Badge tone="orange">default</Badge>}{f.roles && <Badge tone="neutral">{f.roles.join(" / ")}</Badge>}</p>
                          <p className="text-xs text-ink-2">{f.description}</p>
                          {!on && f.background && <p className="mt-0.5 text-[0.6875rem] text-ink-3">{f.background}</p>}
                        </div>
                        <button type="button" onClick={() => update.mutate({ dashboard: { favorites: toggledFavorites(dash.favorites, f.id) } })} aria-pressed={fav}
                          aria-label={fav ? `Unpin ${f.name}` : `Pin ${f.name} as favorite`} className={cn("grid size-8 cursor-pointer place-items-center rounded-full hover:bg-peach", fav ? "text-tangerine" : "text-ink-3")}>
                          <Star className="size-4" fill={fav ? "currentColor" : "none"} />
                        </button>
                        <Switch checked={on} onCheckedChange={(v) => setFeatures({ [f.id]: v })} aria-label={`Show ${f.name} on my dashboard`} />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
          {!matches.length && <p className="text-sm text-ink-2">No feature matches “{q}”.</p>}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-2 font-semibold text-ink">Layout density</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Layout density">
              {DENSITY.map((d) => (
                <button key={d.id} role="radio" aria-checked={dash.layout_density === d.id} onClick={() => update.mutate({ dashboard: { layout_density: d.id } })}
                  className={cn("cursor-pointer rounded-2xl border p-2.5 text-left transition", dash.layout_density === d.id ? "border-tangerine bg-peach" : "border-line hover:border-tangerine/50")}>
                  <span className="mb-1.5 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.min(d.cols, 4)}, 1fr)` }}>
                    {Array.from({ length: Math.min(d.cols, 4) * 2 }, (_, i) => <span key={i} className="h-2.5 rounded-sm bg-tangerine/40" />)}
                  </span>
                  <span className="block text-xs font-semibold text-ink">{d.name}</span><span className="block text-[0.625rem] text-ink-2">{d.desc}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <p className="font-semibold text-ink">Card order</p>
            <p className="mb-2 text-xs text-ink-2">Drag to reorder. Favorites (★) always appear first.</p>
            {shown.length ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={shown.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-1.5">{shown.map((f) => <SortRow key={f.id} f={f} fav={dash.favorites.includes(f.id)} />)}</ul>
                </SortableContext>
              </DndContext>
            ) : <p className="text-xs text-ink-3">No tools shown — turn some on.</p>}
          </Card>
          <Card className="p-4">
            <p className="font-semibold text-ink">Live preview</p>
            <p className="mb-2 text-xs text-ink-2">How your Home dashboard looks on a large screen ({density.name}).</p>
            <div className="rounded-2xl bg-gradient-to-b from-[#e9b3d0] via-[#ffc9a8] to-[#9fb565] p-2">
              {shown.length ? (
                <div className="grid gap-1.5 rounded-xl bg-white/60 p-1.5 dark:bg-black/30" style={{ gridTemplateColumns: `repeat(${density.cols}, minmax(0, 1fr))` }}>
                  {shown.map((f) => (
                    <div key={f.id} className={`pal-${f.palette} pal-card flex flex-col items-center rounded-lg p-1 text-center`}>
                      <FeatureIllustration id={f.id} size={density.cols > 4 ? 16 : 22} />
                      <span className="line-clamp-2 text-[0.5625rem] font-semibold leading-tight text-ink">{f.name}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="rounded-xl bg-white/70 p-4 text-center text-xs text-ink">“Your financial garden is ready to grow. 🍊”</p>}
            </div>
          </Card>
          {update.isError && <p className="text-xs text-bad">Couldn’t save — your previous settings were restored.</p>}
        </div>
      </div>
    </div>
  );
}
