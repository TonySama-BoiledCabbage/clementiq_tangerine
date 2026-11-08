"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setMoneyMask } from "@/lib/format";
import { useComfort } from "@/lib/hooks";
import { useSession } from "@/lib/store";
import { Skeleton } from "@/components/ui/misc";
import { ThemeSync, WorkspaceTopBar } from "./AppChrome";

/**
 * Authenticated frame. Home ("/") is a full-bleed orchard launcher; every other route is a focused
 * workspace with a "Back to Home" header. There is no permanent navigation sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const token = useSession((s) => s.token);
  const comfort = useComfort();
  const expiresAt = useSession((s) => s.expiresAt);
  const logout = useSession((s) => s.logout);
  const router = useRouter();
  const path = usePathname();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const done = () => setHydrated(true);
    if (useSession.persist.hasHydrated()) done();
    return useSession.persist.onFinishHydration(done);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (token && expiresAt && new Date(expiresAt) < new Date()) logout();
    if (!token) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [hydrated, token, expiresAt, logout, router, path]);

  if (!hydrated || !token) {
    return <div className="p-8"><Skeleton className="h-72 w-full rounded-3xl" /><div className="mt-6 grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-3xl" />)}</div></div>;
  }

  const isHome = path === "/";
  // Privacy mode is applied before any page renders, so masked values never reach the DOM.
  setMoneyMask(comfort.mask);
  return (
    <div className="min-h-screen">
      <ThemeSync />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      {!isHome && <WorkspaceTopBar />}
      <main id="main" key={comfort.mask ? "masked" : "visible"} className={isHome ? "" : "mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8"}>
        <Suspense fallback={<Skeleton className="h-96" />}>{children}</Suspense>
      </main>
    </div>
  );
}
