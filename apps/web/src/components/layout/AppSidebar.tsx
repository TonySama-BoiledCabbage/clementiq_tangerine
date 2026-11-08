"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/store";
import { NAV_ADMIN, moreFor, navFor } from "./nav";

function Item({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cn("flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] transition-colors",
        active ? "bg-tangerine font-semibold text-white" : "text-ink hover:bg-black/5")}>
      <Icon className={cn("size-[20px] shrink-0", active ? "text-white" : "text-tangerine")} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="px-3 pb-1 text-[13px] font-semibold text-ink-3">{title}</p>
      {children}
    </div>
  );
}

/** iPadOS-style sidebar for large screens (phones use the bottom tab bar). */
export function AppSidebar() {
  const path = usePathname();
  const role = useSession((s) => s.role);
  const isActive = (href: string) => path.startsWith(href.split("?")[0]);
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 lg:block">
      <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto p-4">
        <Group title={role === "customer" ? "Your money" : "Workspace"}>{navFor(role).map((n) => <Item key={n.href} {...n} active={isActive(n.href)} />)}</Group>
        <Group title="More">{moreFor(role).map((n) => <Item key={n.href} {...n} active={isActive(n.href)} />)}</Group>
        {role === "admin" && <Group title="Admin">{NAV_ADMIN.map((n) => <Item key={n.href} {...n} active={isActive(n.href)} />)}</Group>}
        <p className="mt-auto px-3 text-[12px] leading-relaxed text-ink-3">
          Educational decision support, not financial advice. Every number is computed by Clement Core from the account&apos;s own data.
        </p>
      </nav>
    </aside>
  );
}
