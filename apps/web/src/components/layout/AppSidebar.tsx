"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/store";
import { NAV, NAV_ADMIN, NAV_MORE } from "./nav";

function Item({ href, label, icon: Icon, active, onClick }: { href: string; label: string; icon: React.ElementType; active: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined}
      className={cn("group flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors",
        active ? "bg-ink text-white" : "text-ink-2 hover:bg-peach hover:text-ink")}>
      <Icon className={cn("size-[18px] shrink-0", active ? "text-white" : "text-ink-3 group-hover:text-ink")} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</p>
      {children}
    </div>
  );
}

export function AppSidebar() {
  const path = usePathname();
  const open = useSession((s) => s.mobileNavOpen);
  const setOpen = useSession((s) => s.setMobileNav);
  const role = useSession((s) => s.role);
  const close = () => setOpen(false);
  const isActive = (href: string) => path.startsWith(href.split("?")[0]);

  const body = (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <Group title="Workspace">{NAV.map((n) => <Item key={n.href} {...n} active={isActive(n.href)} onClick={close} />)}</Group>
      <Group title="More">{NAV_MORE.map((n) => <Item key={n.href} {...n} active={isActive(n.href)} onClick={close} />)}</Group>
      {role === "admin" && <Group title="Admin">{NAV_ADMIN.map((n) => <Item key={n.href} {...n} active={isActive(n.href)} onClick={close} />)}</Group>}
      <div className="mt-auto space-y-3">
        <div aria-hidden className="flex gap-1">
          <span className="h-2 w-8 bg-confetti-blue" /><span className="h-2 w-4 bg-confetti-green" /><span className="h-2 w-6 bg-confetti-pink" /><span className="h-2 w-3 bg-confetti-yellow" />
        </div>
        <p className="text-[11px] leading-relaxed text-ink-3">
          Educational decision support, not financial advice. Every number is computed by Clement Core from the account&apos;s own data.
        </p>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-line bg-surface lg:block">{body}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface">
            <div className="flex justify-end p-2"><button onClick={close} aria-label="Close navigation" className="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-peach"><X className="size-5" /></button></div>
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
