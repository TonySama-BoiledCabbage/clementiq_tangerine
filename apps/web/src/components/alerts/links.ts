import type { Alert } from "@clementiq/shared-types";
import type { Role } from "@/lib/store";
/** Old alerts can point to staff tools. Restore the account/preset in the current role's workflow. */
export function alertLink(alert: Pick<Alert, "account_id" | "simulation_link">, role: Role | null): string {
  const url = new URL(alert.simulation_link || "/", "https://clementiq.local");
  const preset = url.searchParams.get("preset") || url.searchParams.get("scenario");
  if (role === "customer") return preset ? "/what-if?scenario=" + encodeURIComponent(preset) : "/home";
  return preset ? "/simulator?account=" + alert.account_id + "&preset=" + encodeURIComponent(preset) : "/judge?account=" + alert.account_id;
}
