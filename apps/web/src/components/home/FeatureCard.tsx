"use client";
import Link from "next/link";
import { ArrowRight, GripVertical, Star } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DashboardPrefs, Feature } from "@/lib/features";
import { cn } from "@/lib/utils";
import { FeatureIllustration } from "./Illustrations";

export type Density = DashboardPrefs["layout_density"];

export const GRID: Record<Density, string> = {
  minimal: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6",
  balanced: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5",
  compact: "grid-cols-1 min-[440px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6 gap-3",
};

const SIZE: Record<Density, { pad: string; art: number; title: string; desc: string }> = {
  minimal: { pad: "p-7 min-h-64", art: 104, title: "text-xl", desc: "text-sm" },
  balanced: { pad: "p-5 min-h-56", art: 80, title: "text-[1.0625rem]", desc: "text-[0.8125rem]" },
  compact: { pad: "p-3.5 min-h-40", art: 52, title: "text-sm", desc: "text-[0.6875rem] line-clamp-2" },
};

export function FeatureCard({ f, density, favorite, onToggleFavorite, arranging, dragHandle }: {
  f: Feature; density: Density; favorite: boolean; onToggleFavorite?: () => void; arranging?: boolean; dragHandle?: React.ReactNode;
}) {
  const s = SIZE[density];
  return (
    <article className={cn(`pal-${f.palette} pal-card card-lift relative flex flex-col rounded-3xl border border-white/60 shadow-card dark:border-white/5`, s.pad, arranging && "cursor-grab ring-2 ring-dashed ring-[var(--accent)]/40")}>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        {dragHandle}
        {onToggleFavorite && (
          <button type="button" onClick={onToggleFavorite} aria-pressed={favorite} aria-label={favorite ? `Unpin ${f.name} from favorites` : `Pin ${f.name} to favorites`}
            title={favorite ? "Unpin favorite" : "Pin as favorite (shows first)"}
            className={cn("grid size-8 cursor-pointer place-items-center rounded-full transition hover:bg-white/60 dark:hover:bg-white/10", favorite ? "text-[var(--accent)]" : "text-ink-3")}>
            <Star className="size-4" fill={favorite ? "currentColor" : "none"} />
          </button>
        )}
      </div>
      <FeatureIllustration id={f.id} size={s.art} />
      <h3 className={cn("mt-2 font-bold tracking-tight text-ink", s.title)}>
        {arranging ? f.name : <Link href={f.route} className="after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none">{f.name}</Link>}
      </h3>
      <p className={cn("mt-1 text-ink-2", s.desc)}>{f.description}</p>
      <div className="mt-auto flex justify-end pt-3">
        <span className="pal-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold" aria-hidden>
          Open <ArrowRight className="size-4" />
        </span>
      </div>
    </article>
  );
}

function SortableCard(props: React.ComponentProps<typeof FeatureCard>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.f.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, opacity: isDragging ? 0.85 : 1 }}>
      <FeatureCard {...props} arranging dragHandle={
        <button type="button" {...attributes} {...listeners} aria-label={`Drag to reorder ${props.f.name}`} title="Drag to reorder (or focus and use arrow keys)"
          className="grid size-8 cursor-grab touch-none place-items-center rounded-full text-ink-2 hover:bg-white/60 active:cursor-grabbing dark:hover:bg-white/10">
          <GripVertical className="size-4" />
        </button>} />
    </div>
  );
}

/** Card grid; in arrange mode cards are draggable (mouse, touch and keyboard via dnd-kit). */
export function FeatureGrid({ features, density, favorites, onToggleFavorite, arranging, onReorder }: {
  features: Feature[]; density: Density; favorites: string[]; onToggleFavorite: (id: string) => void; arranging: boolean; onReorder: (ids: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids: string[] = features.map((f) => f.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  if (!arranging) {
    return (
      <div className={cn("grid", GRID[density])}>
        {features.map((f) => <FeatureCard key={f.id} f={f} density={density} favorite={favorites.includes(f.id)} onToggleFavorite={() => onToggleFavorite(f.id)} />)}
      </div>
    );
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={cn("grid", GRID[density])}>
          {features.map((f) => <SortableCard key={f.id} f={f} density={density} favorite={favorites.includes(f.id)} onToggleFavorite={() => onToggleFavorite(f.id)} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
