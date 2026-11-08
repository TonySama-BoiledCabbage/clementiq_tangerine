"use client";
/**
 * The ClementIQ orchard, composed of independent layers:
 *   1. OrchardBackground (or an optional photographic background)  2. MoneyTrees + floating coins
 *   3. OrchardCharacter (default or personalised)                   4. children (dashboard UI)
 * Only layer 3 changes per user, so personalisation never regenerates the whole scene.
 */
import { useEffect, useState } from "react";
import type { Appearance } from "@/lib/hooks";
import { usePrefersReducedMotion } from "@/lib/hooks";
import type { Growth } from "@/lib/growth";
import { cn } from "@/lib/utils";
import { OrchardBackground } from "./OrchardBackground";
import { MoneyTrees } from "./MoneyTrees";
import { OrchardCharacter, type CharacterMode } from "./OrchardCharacter";

export const PHOTO_BACKGROUND = "/orchard/photo.jpg";

/** The photographic style needs an image you supply at apps/web/public/orchard/photo.jpg. */
export function usePhotoAvailable(enabled = true): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    fetch(PHOTO_BACKGROUND, { method: "HEAD" }).then((r) => setOk(r.ok && (r.headers.get("content-type") ?? "").startsWith("image/"))).catch(() => setOk(false));
  }, [enabled]);
  return ok;
}

function FloatingCoins() {
  const items = [8, 17, 29, 41, 56, 64, 73, 82, 91];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((left, i) => (
        <span key={i} className="anim-float absolute bottom-6 block rounded-full"
          style={{ left: `${left}%`, width: i % 3 ? 6 : 9, height: i % 3 ? 6 : 9, animationDelay: `${(i * 1.1) % 9}s`,
                   background: i % 3 ? "radial-gradient(circle, #fff7c2, #ffd34d)" : "radial-gradient(circle at 35% 35%, #fff0a0, #d9a520)",
                   boxShadow: "0 0 10px rgba(255, 214, 90, 0.8)" }} />
      ))}
    </div>
  );
}

export function OrchardScene({ appearance, growth, character, celebrate, className, children }: {
  appearance: Appearance; growth: Growth; character: { mode: CharacterMode; url: string | null; transparent?: boolean };
  celebrate?: boolean; className?: string; children?: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const photoOk = usePhotoAvailable(appearance.orchard_enabled && appearance.orchard_style === "photo");
  const animOn = appearance.animations && !reduced;
  const usePhoto = appearance.orchard_style === "photo" && photoOk === true;
  const vibe = 0.92 + growth.vibrance * 0.12;

  if (!appearance.orchard_enabled) {
    return <div className={cn("relative overflow-hidden peach-gradient", className)}>{children}</div>;
  }
  return (
    <div className={cn("orchard relative overflow-hidden", className)} data-anim={animOn ? "on" : "off"} data-intensity={appearance.animation_intensity}>
      <div className="absolute inset-0 dark:brightness-[0.78]" style={{ filter: `saturate(${vibe}) brightness(${0.96 + growth.vibrance * 0.06})` }}>
        {usePhoto
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={PHOTO_BACKGROUND} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <OrchardBackground />}
        {/* Money trees OFF = plain tangerine trees (no bills or coins on the branches). */}
        <MoneyTrees growth={growth} bills={appearance.money_trees} coins={appearance.money_trees} />
        {appearance.floating_coins && animOn && <FloatingCoins />}
      </div>
      {/* soft fade into the page so the cards panel sits naturally on the orchard */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[var(--page)]" aria-hidden />
      <OrchardCharacter mode={character.mode} url={character.url} transparent={character.transparent} />
      {celebrate && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {[[30, 40], [45, 30], [60, 45], [72, 28], [52, 55]].map(([l, t], i) => (
            <span key={i} className="anim-pop absolute block size-16 rounded-full" style={{ left: `${l}%`, top: `${t}%`, animationDelay: `${i * 0.15}s`,
              background: "radial-gradient(circle, rgba(255,240,160,0.95), rgba(255,180,60,0) 70%)" }} />
          ))}
        </div>
      )}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
