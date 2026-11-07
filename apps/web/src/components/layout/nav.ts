import { Activity, Database, LifeBuoy, Lightbulb, SlidersHorizontal, UserRound } from "lucide-react";

/**
 * Judging-path navigation (ui-redesign). Only what the 5-minute session needs:
 *   Stress Test  — live twist (README parts 1–3 on one page)
 *   Findings     — the portfolio-level "biggest finding" for the pitch
 *   Customer     — deeper "know the customer" view for Q&A
 * The original pages (WorldPulse, map, investments, Solana, advisor, timeline, alerts, resilience score)
 * still exist as routes but are intentionally not linked.
 */
export const NAV = [
  { href: "/judge", label: "Stress Test", icon: Activity },
  { href: "/insights", label: "Portfolio Findings", icon: Lightbulb },
  { href: "/dashboard", label: "Customer Profile", icon: UserRound },
] as const;

export const NAV_MORE = [
  { href: "/simulator", label: "Advanced Simulator", icon: SlidersHorizontal },
  { href: "/recovery", label: "Recovery Plans", icon: LifeBuoy },
] as const;

export const NAV_ADMIN = [{ href: "/admin", label: "Data Import", icon: Database }] as const;
