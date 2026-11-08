import type { ShockComponent } from "@clementiq/shared-types";

export const DEFAULT_SHOCK: ShockComponent[] = [{ type: "job_loss", income_replacement_pct: 55, duration_months: 6 }];
export interface ScenarioDraft { account_id: number; components: ShockComponent[] | null; mode: "judging" | "extended"; horizon_months: number; discretionary_cut_pct: number }
export interface GoalDraft { account_id: number; target_months: number; target_basis: string; contribution_share_pct: number; discretionary_cut_pct: number; deadline_months: number }
export const scenarioDraft = (account_id: number, components: ShockComponent[] | null = DEFAULT_SHOCK): ScenarioDraft => ({ account_id, components, mode: "judging", horizon_months: 24, discretionary_cut_pct: 0 });
export const goalDraft = (account_id: number): GoalDraft => ({ account_id, target_months: 3, target_basis: "spending", contribution_share_pct: 50, discretionary_cut_pct: 0, deadline_months: 0 });
export const goalRequest = (goal: GoalDraft) => ({ ...goal, deadline_months: goal.deadline_months || null });
