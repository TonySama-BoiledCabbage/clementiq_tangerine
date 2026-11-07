import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Status colors are always paired with an icon and a text label (never color alone). */
export function SeverityBadge({ s }: { s: "low" | "medium" | "high" }) {
  if (s === "high") return <Badge tone="bad"><AlertOctagon /> High</Badge>;
  if (s === "medium") return <Badge tone="warn"><AlertTriangle /> Medium</Badge>;
  return <Badge tone="blue"><Info /> Low</Badge>;
}
