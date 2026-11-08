"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useSession } from "@/lib/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/controls";
import { LogoMark } from "./Logo";

/** Glass top bar (iOS navigation-bar material): product mark left, account right. Phones navigate with the bottom tab bar. */
export function TopNavigation() {
  const { role, sub, accountId, logout } = useSession();
  const router = useRouter();
  const who = role === "customer" ? `Account ${accountId}` : role ? role[0].toUpperCase() + role.slice(1) : "Guest";
  return (
    <header className="glass sticky top-0 z-30 h-14 !shadow-[0_0.5px_0_rgb(0_0_0/0.12)]">
      <div className="flex h-full items-center gap-2.5 px-4">
        <Link href="/" aria-label="ClementIQ home" className="flex items-center gap-2">
          <LogoMark className="size-8" />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">ClementIQ</span>
        </Link>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full pl-1 pr-1 text-ink hover:bg-black/5 sm:pr-3" aria-label="Account menu">
              <span className="grid size-8 place-items-center rounded-full bg-accent-tint text-tangerine"><UserRound className="size-[18px]" /></span>
              <span className="hidden text-[15px] font-medium sm:inline">{who}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Signed in as <b className="text-ink">{sub}</b>{role === "judge" && <span className="block">Read-only judge access</span>}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/settings")}><Settings /> Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { logout(); router.push("/login"); }} className="text-bad"><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
