"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/store";
import { tabsFor } from "./nav";

/**
 * Phone tab bar (< lg) in the iOS 26/27 Liquid Glass form: a floating capsule inset from the screen edges.
 * - primary destinations and account details (5 tabs); other secondary pages live behind "More"
 * - icon AND label on every tab; the current tab gets the accent colour, a heavier icon and a glass selection pill
 * - sits above the home indicator via env(safe-area-inset-bottom); every tab is a ≥ 44pt hit area
 */
export function MobileTabBar() {
  const path = usePathname();
  const role = useSession((s) => s.role);
  const isActive = (href: string, match: readonly string[] = []) => path.startsWith(href) || match.some((m) => path === m || path.startsWith(`${m}/`));

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden">
      <ul className="glass mx-auto flex h-[62px] max-w-md items-stretch gap-1 rounded-full p-1">
        {tabsFor(role).map(({ href, label, icon: Icon, match }) => {
          const active = isActive(href, match);
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined}
                className={cn("flex h-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-full transition-colors select-none [-webkit-tap-highlight-color:transparent] active:scale-95",
                  active ? "bg-black/[0.06] text-tangerine" : "text-ink")}>
                <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                <span className="text-[11px] font-semibold leading-none tracking-[-0.01em]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
