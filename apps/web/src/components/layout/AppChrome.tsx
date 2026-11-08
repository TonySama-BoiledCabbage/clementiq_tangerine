"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, ChevronDown, LayoutGrid, LogOut, Settings, UserRound } from "lucide-react";
import { DEFAULT_DASHBOARD, featureForPath, homeFeatures } from "@/lib/features";
import { useComfort, useSettings, useUpdatePrefs, useVerifiedRole } from "@/lib/hooks";
import { initials, useMediaUrl, useProfile } from "@/lib/profile";
import { useSession } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/controls";
import { NotificationCenter } from "@/components/alerts/NotificationCenter";
import { FeatureIllustration } from "@/components/home/Illustrations";
import { Logo } from "./Logo";

/** Applies the saved theme and reduced-motion choice (per user, from the server). */
export function ThemeSync() {
  const s = useSettings();
  const theme = s.data?.preferences.appearance?.theme;
  const reduced = s.data?.preferences.display.reduced_motion;
  const comfort = useComfort();
  const update = useUpdatePrefs();
  useEffect(() => {
    if (!theme) return;
    const el = document.documentElement;
    if (theme === "system") delete el.dataset.theme;
    else el.dataset.theme = theme;
    try { if (theme === "system") localStorage.removeItem("clementiq-theme"); else localStorage.setItem("clementiq-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reduced || comfort.calm_mode ? "true" : "false";
  }, [reduced, comfort.calm_mode]);
  // Accessibility & Comfort preferences become attributes on <html>; globals.css does the rest.
  useEffect(() => {
    const el = document.documentElement.dataset;
    el.textSize = comfort.text_size;
    el.contrast = comfort.high_contrast ? "high" : "normal";
    el.focus = comfort.enhanced_focus ? "enhanced" : "normal";
    el.simple = comfort.simple_mode ? "true" : "false";
    el.calm = comfort.calm_mode ? "true" : "false";
  }, [comfort.text_size, comfort.high_contrast, comfort.enhanced_focus, comfort.simple_mode, comfort.calm_mode]);
  // Privacy mode shortcut: Alt+Shift+H toggles "Hide my balances".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyH") {
        e.preventDefault();
        update.mutate({ privacy: { mask_balances: !comfort.mask } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comfort.mask, update]);
  return null;
}

export function ProfileAvatar({ size = 36, className }: { size?: number; className?: string }) {
  const p = useProfile();
  const url = useMediaUrl("photo", p.data?.photo?.version);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-tangerine font-bold text-white ring-2 ring-white/80", className)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="Your profile photo" className="h-full w-full object-cover" /> : initials(p.data?.display_name)}
    </span>
  );
}

/** The single account entry point: exactly My Profile, Settings and Sign Out. */
function UserMenu() {
  const { sub, logout } = useSession();
  const role = useVerifiedRole();
  const router = useRouter();
  const p = useProfile();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer rounded-full focus-visible:ring-4 focus-visible:ring-tangerine/40" aria-label={`Account menu for ${p.data?.display_name ?? "you"}`}>
        <ProfileAvatar size={40} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="flex items-center gap-3">
          <ProfileAvatar size={36} />
          <span><b className="block text-sm text-ink">{p.data?.display_name ?? sub}</b>{role}{role === "judge" && " · read-only"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/profile")} className="min-h-10"><UserRound /> My Profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings")} className="min-h-10"><Settings /> Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { logout(); router.push("/login"); }} className="min-h-10"><LogOut /> Sign Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RightActions({ onImage = false }: { onImage?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <NotificationCenter className={onImage ? "glass text-ink shadow-sm" : "text-ink-2 hover:bg-peach"} />
      <UserMenu />
    </div>
  );
}

export function HomeTopBar() {
  return (
    <header className="relative z-20 flex items-center justify-between gap-3 px-4 pt-4 sm:px-8">
      <Link href="/" aria-label="ClementIQ home" className="rounded-2xl bg-[#ff7a1a]/85 py-1.5 pl-1.5 pr-4 shadow-lg ring-1 ring-white/40 backdrop-blur-md"><Logo light /></Link>
      <RightActions onImage />
    </header>
  );
}

/** Focused workspace header: Back to Home + current feature + quick switch (no sidebar). */
export function WorkspaceTopBar() {
  const path = usePathname();
  const role = useVerifiedRole();
  const settings = useSettings();
  const dash = settings.data?.preferences.dashboard ?? DEFAULT_DASHBOARD;
  const router = useRouter();
  const current = featureForPath(path);
  // Same registry, permissions and preferences as the Home cards: enabled features only, same order.
  const visible = homeFeatures(dash, role);
  const pageName = current?.name ?? (path.startsWith("/settings") ? "Settings" : path.startsWith("/profile") ? "My Profile" : "ClementIQ");
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-tangerine px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105">
          <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back to Home</span><span className="sm:hidden">Home</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 cursor-pointer items-center gap-2 rounded-2xl px-2 py-1 hover:bg-peach" aria-label="Switch feature">
            {current ? <FeatureIllustration id={current.id} size={30} /> : <span className="grid size-9 place-items-center rounded-xl bg-peach text-tangerine">{path.startsWith("/settings") ? <Settings className="size-4" /> : path.startsWith("/profile") ? <UserRound className="size-4" /> : <LayoutGrid className="size-4" />}</span>}
            <span className="truncate text-sm font-bold text-ink sm:text-base">{pageName}</span>
            <ChevronDown className="size-4 shrink-0 text-ink-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-72 overflow-y-auto">
            <DropdownMenuLabel>Your tools</DropdownMenuLabel>
            {visible.length ? visible.map((f) => (
              <DropdownMenuItem key={f.id} onSelect={() => router.push(f.route)} aria-current={current?.id === f.id ? "page" : undefined}
                className={current?.id === f.id ? "bg-peach font-semibold" : undefined}>
                <FeatureIllustration id={f.id} size={22} /> {f.name}
              </DropdownMenuItem>
            )) : <p className="px-2.5 py-2 text-xs text-ink-2">No tools enabled. Turn some on in Settings.</p>}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto"><RightActions /></div>
      </div>
    </header>
  );
}

