"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Settings, UserRound } from "lucide-react";
import { useSession } from "@/lib/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/controls";
import { Logo } from "./Logo";

/** White, hairline-bordered top bar: logo left, account menu right. Nothing that competes with the work area. */
export function TopNavigation() {
  const { role, sub, accountId, logout, setMobileNav } = useSession();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-line bg-surface">
      <div className="flex h-full items-center gap-3 px-4">
        <button className="grid size-11 cursor-pointer place-items-center rounded-full text-ink hover:bg-peach lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
          <Menu className="size-5" />
        </button>
        <Link href="/judge" aria-label="ClementIQ — Stress Test"><Logo /></Link>
        <span className="hidden text-sm text-ink-3 md:inline">Financial Resilience Engine</span>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line-strong py-1 pl-1 pr-3 text-ink hover:bg-peach" aria-label="Account menu">
              <span className="grid size-8 place-items-center rounded-full bg-ink text-white"><UserRound className="size-4" /></span>
              <span className="hidden text-xs font-semibold sm:inline">{role === "customer" ? `Customer ${accountId}` : role ? role[0].toUpperCase() + role.slice(1) : "Guest"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Signed in as <b className="text-ink">{sub}</b>{role === "judge" && <span className="block">Read-only judge access</span>}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/settings")}><Settings /> Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { logout(); router.push("/login"); }}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
