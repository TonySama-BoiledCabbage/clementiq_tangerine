"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut, Settings } from "lucide-react";
import { useSession } from "@/lib/store";
import { NAV_ADMIN, moreFor } from "@/components/layout/nav";

/** One row of an iOS-style inset grouped list: icon tile, label, chevron; ≥ 44pt tall. */
function Row({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  return (
    <li>
      <Link href={href} className="flex min-h-11 items-center gap-3 px-4 py-2.5 active:bg-[#e8e8ed]">
        <span className="grid size-7 place-items-center rounded-[7px] bg-tangerine text-white"><Icon className="size-4" aria-hidden /></span>
        <span className="flex-1 text-[17px] tracking-[-0.02em] text-[#1d1d1f]">{label}</span>
        <ChevronRight className="size-4 text-[#c7c7cc]" aria-hidden />
      </Link>
    </li>
  );
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      {title && <h2 className="px-4 text-[13px] font-normal uppercase tracking-[0] text-[#6e6e73]">{title}</h2>}
      <ul className="divide-y-[0.5px] divide-line overflow-hidden rounded-[22px] bg-white">{children}</ul>
    </section>
  );
}

/** "More" tab: the secondary destinations that don't earn a place in the tab bar (iOS More-tab pattern). */
export default function MorePage() {
  const role = useSession((s) => s.role);
  const sub = useSession((s) => s.sub);
  const logout = useSession((s) => s.logout);
  const router = useRouter();

  return (
    <div className="mx-auto max-w-xl space-y-7">
      <h1 className="large-title px-1">More</h1>
      <Group title={role === "customer" ? "Your account" : "Tools"}>{moreFor(role).map((n) => <Row key={n.href} {...n} />)}</Group>
      {role === "admin" && <Group title="Admin">{NAV_ADMIN.map((n) => <Row key={n.href} {...n} />)}</Group>}
      <Group title={sub ? `Signed in as ${sub}` : "Account"}>
        <Row href="/settings" label="Settings" icon={Settings} />
      </Group>
      <Group>
        <li>
          <button onClick={() => { logout(); router.push("/login"); }}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 px-4 py-2.5 text-[17px] tracking-[-0.02em] text-bad active:bg-[#e8e8ed]">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </li>
      </Group>
      <p className="px-4 text-[12px] leading-relaxed text-[#6e6e73]">Educational decision support, not financial advice. Every number is computed by Clement Core from the account&apos;s own data.</p>
    </div>
  );
}
