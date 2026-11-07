"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Settings, Sparkles, Sun, UserRound } from "lucide-react";
import { useAIStatus } from "@/lib/hooks";
import { useSession } from "@/lib/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/controls";
import { NotificationCenter } from "@/components/alerts/NotificationCenter";
import { Logo } from "./Logo";

function toggleTheme() {
  const el = document.documentElement;
  const dark = el.dataset.theme ? el.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  el.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("clementiq-theme", el.dataset.theme); } catch { /* storage unavailable */ }
}

export function TopNavigation() {
  const { role, sub, accountId, logout, setMobileNav } = useSession();
  const ai = useAIStatus();
  const router = useRouter();
  return (
    <header className="brand-gradient sticky top-0 z-30 h-16 shadow-md">
      <div className="mx-auto flex h-full items-center gap-3 px-4">
        <button className="cursor-pointer rounded-lg p-2 text-white hover:bg-white/15 lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
          <Menu className="size-5" />
        </button>
        <Link href="/" aria-label="ClementIQ home"><Logo light /></Link>
        <p className="mx-auto hidden text-center text-sm font-medium text-white/95 md:block">
          Your Daily Dose of Financial Intelligence
          <span className="block text-[11px] font-normal text-white/75">Smart Guidance. A More Resilient You.</span>
        </p>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <span title={ai.data?.gemini ? `Gemini model: ${ai.data.model}` : "Gemini not configured — deterministic template explanations"}
            className="hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white sm:inline-flex">
            <Sparkles className="size-3.5" /> {ai.data?.gemini ? "Powered by Gemini" : "Gemini: template mode"}
          </span>
          <NotificationCenter />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-white hover:bg-white/25" aria-label="Account menu">
              <span className="grid size-7 place-items-center rounded-full bg-white text-tangerine"><UserRound className="size-4" /></span>
              <span className="hidden text-xs font-semibold sm:inline">{role === "customer" ? `Customer ${accountId}` : role ? role[0].toUpperCase() + role.slice(1) : "Guest"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Signed in as <b className="text-ink">{sub}</b>{role === "judge" && <span className="block">Read-only judge access</span>}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/settings")}><Settings /> Account settings</DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleTheme}><Sun className="dark:hidden" /><Moon className="hidden dark:block" /> Toggle theme</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { logout(); router.push("/login"); }}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
