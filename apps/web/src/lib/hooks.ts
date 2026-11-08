"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Alert, Indicator, NewsEvent, Preset, Resilience, SimResult, SourceStatus, Summary } from "@clementiq/shared-types";
import { api } from "./api";
import { useSession } from "./store";

export function useAccount(): number | null {
  const accountId = useSession((s) => s.accountId);
  const setAccount = useSession((s) => s.setAccount);
  const role = useSession((s) => s.role);
  const bound = useSession((s) => s.boundAccount);
  const params = useSearchParams();
  const fromUrl = params.get("account");
  useEffect(() => {
    if (role === "customer") {
      if (bound && accountId !== bound) setAccount(bound);
      return;
    }
    if (fromUrl && /^\d+$/.test(fromUrl) && Number(fromUrl) !== accountId) setAccount(Number(fromUrl));
  }, [fromUrl, accountId, setAccount, role, bound]);
  return role === "customer" ? bound : accountId;
}

export interface Me {
  sub: string; role: "judge" | "customer" | "admin"; account_id: number | null; read_only: boolean;
  entitlements: { judge_demo: boolean; account_search: boolean; data_import_view: boolean; data_import_run: boolean };
  features_allowed: string[];
}

/** Identity and entitlements as verified by the server from the signed token. Role-gated UI uses this,
 *  never the role cached in browser storage (which a user could edit). */
export function useMe() {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ["me", token], queryFn: () => api<Me>("/auth/me"), enabled: !!token, staleTime: 5 * 60_000 });
}

export function useVerifiedRole(): Me["role"] | null {
  return useMe().data?.role ?? null;
}

export function useSummary(accountId: number | null) {
  return useQuery({
    queryKey: ["summary", accountId],
    queryFn: () => api<Summary>(`/accounts/${accountId}/summary`),
    enabled: accountId != null,
    staleTime: 5 * 60_000,
  });
}

export function useResilience(accountId: number | null) {
  return useQuery({ queryKey: ["resilience", accountId], queryFn: () => api<Resilience>(`/accounts/${accountId}/resilience`),
                    enabled: accountId != null, staleTime: 5 * 60_000 });
}

export function usePresets() {
  return useQuery({ queryKey: ["presets"], queryFn: () => api<{ presets: Preset[]; types: Record<string, string> }>("/shocks/presets"),
                    staleTime: Infinity });
}

export function useSimulation(req: unknown, enabled: boolean) {
  return useQuery({
    queryKey: ["simulate", req],
    queryFn: () => api<SimResult>("/shocks/simulate", { method: "POST", json: req }),
    enabled, placeholderData: keepPreviousData, staleTime: 60_000,
  });
}

export interface AlertsResponse { total: number; unread: number; categories: string[]; items: Alert[] }

export function useAlerts(params: { category?: string; unread?: boolean; limit?: number } = {}) {
  const token = useSession((s) => s.token);
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.unread !== undefined) q.set("unread", String(params.unread));
  q.set("limit", String(params.limit ?? 50));
  return useQuery({ queryKey: ["alerts", params], queryFn: () => api<AlertsResponse>(`/alerts?${q}`), enabled: !!token,
                    refetchInterval: 60_000 });
}

export function useMarkAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_read }: { id: number; is_read: boolean }) => api<Alert>(`/alerts/${id}`, { method: "PATCH", json: { is_read } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useGenerateAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: number) => api<{ created: number; candidates: number; suppressed: Record<string, number> }>(
      `/alerts/generate/${accountId}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export interface EventsResponse {
  total: number; items: NewsEvent[]; topics: Record<string, string>; last_successful_update: string | null;
  hypothetical_templates: { id: string; topic: string; magnitude: number; title: string }[]; empty_reason: string | null;
}

export function useEvents(topic?: string, classification?: string) {
  const q = new URLSearchParams({ limit: "40" });
  if (topic) q.set("topic", topic);
  if (classification) q.set("classification", classification);
  return useQuery({ queryKey: ["events", topic, classification], queryFn: () => api<EventsResponse>(`/worldpulse/events?${q}`) });
}

export function useIndicators() {
  return useQuery({ queryKey: ["indicators"], queryFn: () => api<{ items: Indicator[]; sources: SourceStatus[] }>("/worldpulse/indicators") });
}

export interface Monitoring {
  worker_running: boolean; note: string | null;
  jobs: Record<string, { interval_minutes: number; last_run: string | null; last_status: string | null; last_success: string | null; last_runner: string | null }>;
}

export function useSources() {
  return useQuery({ queryKey: ["sources"], queryFn: () => api<{ sources: SourceStatus[]; monitoring: Monitoring }>("/system/sources"),
                    refetchInterval: 120_000 });
}

export function useRefreshWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ status: string; detail: Record<string, unknown> }>("/worldpulse/refresh", { method: "POST" }),
    onSuccess: () => {
      for (const k of ["events", "indicators", "sources", "map", "alerts"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export interface SettingsResponse {
  preferences: {
    alerts: { enabled: boolean; categories: Record<string, boolean>; min_severity: "low" | "medium" | "high"; relevance_threshold: number;
              runway_threshold_months: number; max_per_day: number; ai_explanations?: boolean; quiet_hours: { enabled: boolean; start: string; end: string; timezone: string } };
    channels: { in_app: boolean; email: { opt_in: boolean; address: string | null }; browser_push: { opt_in: boolean } };
    interests: string[]; display: { reduced_motion: boolean; enable_3d: boolean; currency: string }; watched_accounts: number[];
    dashboard: import("./features").DashboardPrefs;
    appearance: Appearance;
    avatar: { generation_consent: boolean; consent_at: string | null; personalized_enabled: boolean; character?: "default" | "photo" | "generated" };
    privacy: { personalized_ai: boolean; optional_ai_insights: boolean };
  };
  integrations: Record<string, boolean | string>;
}

export function useSettings() {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsResponse>("/settings"), enabled: !!token, staleTime: 60_000 });
}

export interface Appearance {
  theme: "light" | "dark" | "system"; orchard_enabled: boolean; money_trees: boolean; floating_coins: boolean;
  animations: boolean; animation_intensity: "low" | "medium" | "high"; orchard_style: "illustrated" | "photo"; growth_visuals: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system", orchard_enabled: true, money_trees: true, floating_coins: true, animations: true,
  animation_intensity: "medium", orchard_style: "illustrated", growth_visuals: true,
};

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    const cur = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur) ? deepMerge(cur, v) : v;
  }
  return out as T;
}

/** Optimistic preference updates: the UI changes instantly, then the server copy (per user) is saved.
 *  On failure the previous preferences are restored. */
export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<SettingsResponse>("/settings", { method: "PATCH", json: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["settings"] });
      const prev = qc.getQueryData<SettingsResponse>(["settings"]);
      if (prev) qc.setQueryData<SettingsResponse>(["settings"], { ...prev, preferences: deepMerge(prev.preferences, patch) });
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(["settings"], ctx.prev); },
    onSuccess: (d) => qc.setQueryData(["settings"], (old: SettingsResponse | undefined) => ({ ...(old ?? d), preferences: d.preferences })),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<SettingsResponse>("/settings", { method: "PATCH", json: patch }),
    onSuccess: (d) => qc.setQueryData(["settings"], (old: SettingsResponse | undefined) => ({ ...(old ?? d), preferences: d.preferences })),
  });
}

export function useAIStatus() {
  return useQuery({ queryKey: ["ai-status"], queryFn: () => api<{ gemini: boolean; model: string | null; grounding: boolean; tools: string[] }>("/ai/status"),
                    staleTime: 10 * 60_000 });
}

export function usePrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
