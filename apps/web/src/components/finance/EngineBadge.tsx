import { Calculator, Snowflake, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Shows which engine produced a result — Clement Core (numbers) vs Clement Gemini (words). */
export function EngineBadge({ engine }: { engine: string }) {
  if (engine.startsWith("clement-gemini")) return <Badge tone="violet" title="Explanation written by Google Gemini from Clement Core outputs"><Sparkles /> Clement Gemini</Badge>;
  if (engine === "clement-core-template") return <Badge tone="neutral" title="Gemini unavailable — deterministic explanation template"><Calculator /> Core template</Badge>;
  if (engine.startsWith("snowflake")) return <Badge tone="blue"><Snowflake /> Snowflake Cortex</Badge>;
  return <Badge tone="orange" title="Deterministic calculation"><Calculator /> Clement Core</Badge>;
}
