"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/store";
import { NAV, NAV_EXTRA } from "./nav";

function Item({ href, label, icon: Icon, active, onClick }: { href: string; label: string; icon: React.ElementType; active: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined}
      className={cn("group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition",
        active ? "bg-peach text-tangerine" : "text-ink-2 hover:bg-peach/60 hover:text-ink")}>
      <Icon className={cn("size-[18px] shrink-0", active ? "text-tangerine" : "text-ink-3 group-hover:text-ink-2")} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppSidebar() {
  const path = usePathname();
  const open = useSession((s) => s.mobileNavOpen);
  const setOpen = useSession((s) => s.setMobileNav);
  const role = useSession((s) => s.role);
  const close = () => setOpen(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href.split("?")[0]));
  const extras = NAV_EXTRA.filter((n) => n.href !== "/admin" || role === "admin" || role === "judge");

  const body = (
    <nav aria-label="Main" className="flex h-full flex-col gap-0.5 overflow-y-auto p-3">
      {NAV.map((n) => <Item key={n.href} {...n} active={isActive(n.href)} onClick={close} />)}
      <div className="mx-3 my-3 h-px bg-line" />
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">Hackathon</p>
      {extras.map((n) => <Item key={n.href} {...n} active={isActive(n.href)} onClick={close} />)}
      <div className="mt-auto rounded-2xl peach-gradient p-3 text-[11px] text-ink-2">
        Educational decision support — not financial advice. Numbers come from Clement Core; explanations from Clement Gemini.
      </div>
    </nav>
  );

  return (
    <>
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-line bg-surface lg:block">{body}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
            <div className="flex justify-end p-2"><button onClick={close} aria-label="Close navigation" className="cursor-pointer rounded-lg p-2 hover:bg-peach"><X className="size-5" /></button></div>
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
