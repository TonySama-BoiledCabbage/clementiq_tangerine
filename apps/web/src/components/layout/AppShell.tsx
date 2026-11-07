"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/store";
import { Skeleton } from "@/components/ui/misc";
import { AdvisorPanel } from "./AdvisorPanel";
import { AppSidebar } from "./AppSidebar";
import { TopNavigation } from "./TopNavigation";

/** Authenticated application frame: header, left nav, main content, right AI advisor. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const token = useSession((s) => s.token);
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
    return <div className="p-8"><Skeleton className="h-16 w-full" /><div className="mt-6 grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div></div>;
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <TopNavigation />
      <div className="flex">
        <AppSidebar />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<Skeleton className="h-96" />}>{children}</Suspense>
        </main>
        <Suspense><AdvisorPanel /></Suspense>
      </div>
    </div>
  );
}
