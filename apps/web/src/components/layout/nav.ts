import type { ElementType } from "react";
import { Activity, CalendarCheck, Bell, Database, Ellipsis, House, Inbox, LifeBuoy, Lightbulb, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";

/**
 * Role-based navigation (Brief §11). Two products on one engine:
 *   Staff (advisor = admin, judge): Accounts → Stress Test → Findings. Start from who needs help.
 *   Customer: Home → Plan → What if. Start from "am I OK this month?".
 * The original pages (WorldPulse, map, investments, Solana, advisor, timeline, alerts, resilience score)
 * still exist as routes but are intentionally not linked.
 */
export type Role = "customer" | "judge" | "admin";
export interface NavItem { href: string; label: string; icon: ElementType; match?: readonly string[] }

const STAFF: NavItem[] = [
  { href: "/accounts", label: "Accounts", icon: Inbox },
  { href: "/judge", label: "Stress Test", icon: Activity },
  { href: "/insights", label: "Findings", icon: Lightbulb },
];
const CUSTOMER: NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/plan", label: "Plan", icon: CalendarCheck },
  { href: "/what-if", label: "What if", icon: Sparkles },
];
const STAFF_MORE: NavItem[] = [
  { href: "/dashboard", label: "Customer Profile", icon: UserRound },
  { href: "/simulator", label: "Advanced Simulator", icon: SlidersHorizontal },
  { href: "/recovery", label: "Recovery Plans", icon: LifeBuoy },
];
const CUSTOMER_MORE: NavItem[] = [{ href: "/dashboard", label: "Account details", icon: UserRound }];
export const NAV_ADMIN: NavItem[] = [{ href: "/admin", label: "Data & operations", icon: Database }];

export const isStaff = (role: Role | null | undefined) => role === "judge" || role === "admin";
export const homeFor = (role: Role | null | undefined) => (role === "customer" ? "/home" : role === "admin" ? "/accounts" : "/judge");
export const navFor = (role: Role | null | undefined) => (role === "customer" ? CUSTOMER : STAFF);
export const moreFor = (role: Role | null | undefined) => [
  ...(role === "customer" ? CUSTOMER_MORE : STAFF_MORE),
  { href: "/alerts", label: "Notifications", icon: Bell },
  ...(role === "judge" ? [{ href: "/admin", label: "Dataset status", icon: Database }] : []),
];

/** Phone bottom tabs (iOS tab-bar pattern): three top-level pages + "More". `match` lights a tab for pages reached from it. */
export function tabsFor(role: Role | null | undefined): NavItem[] {
  const more = moreFor(role).map((n) => n.href);
  return [...navFor(role), { href: "/more", label: "More", icon: Ellipsis, match: [...more, "/settings", "/admin"] }];
}
