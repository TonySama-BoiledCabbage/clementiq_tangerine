"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/store";
import { homeFor } from "@/components/layout/nav";
import { Spinner } from "@/components/ui/misc";

/** "/" sends each role to its own start page: customer → Home, advisor (admin) → Accounts, judge → Stress Test. */
export default function Root() {
  const role = useSession((s) => s.role);
  const router = useRouter();
  useEffect(() => { if (role) router.replace(homeFor(role)); }, [role, router]);
  return <div className="grid min-h-[40vh] place-items-center"><Spinner /></div>;
}
