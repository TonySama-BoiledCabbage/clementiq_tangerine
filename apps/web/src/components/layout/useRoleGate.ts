"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/store";
import { homeFor, isStaff } from "./nav";

/**
 * Keeps each role on its own product: customers never land on staff pages and vice versa.
 * Returns true once the current role may see the page (render nothing until then).
 */
export function useRoleGate(audience: "staff" | "customer" | "any"): boolean {
  const role = useSession((s) => s.role);
  const router = useRouter();
  const ok = !!role && (audience === "any" || (audience === "staff" ? isStaff(role) : role === "customer"));
  useEffect(() => { if (role && !ok) router.replace(homeFor(role)); }, [role, ok, router]);
  return ok;
}
