"use client";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { useComfort } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { calmSeverity } from "@/components/ui/comfort";

/** Status colours are always paired with an icon and a text label (never colour alone).
 *  Calm Mode keeps the same meaning with gentler wording. */
export function SeverityBadge({ s }: { s: "low" | "medium" | "high" }) {
  const { calm_mode } = useComfort();
  const label = calmSeverity(s, calm_mode);
  if (s === "high") return <Badge tone={calm_mode ? "warn" : "bad"}><AlertOctagon /> {label}</Badge>;
  if (s === "medium") return <Badge tone="warn"><AlertTriangle /> {label}</Badge>;
  return <Badge tone="blue"><Info /> {label}</Badge>;
}
