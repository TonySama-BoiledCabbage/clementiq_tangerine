import type { Summary } from "@clementiq/shared-types";

/**
 * Orchard growth derived ONLY from the selected account's real Clement Core numbers.
 * Visuals never go below a healthy-looking baseline (no shaming), and every effect has a caption
 * explaining which number drives it.
 */
export interface Growth {
  fruit: number;        // 0..1   emergency-fund progress → number of tangerines
  golden: number;       // 0..3   completed savings goals (3, 6, 9 months of spending saved)
  fullness: number;     // 0..1   resilience score → fuller canopy
  vibrance: number;     // 0..1   positive cash flow → warmer, brighter scene
  milestone: number;    // 0..4   quarters of the 3-month goal reached (for celebrations)
  data: boolean;        // false = decorative default, no account selected
  captions: string[];
}

export const DECORATIVE_GROWTH: Growth = {
  fruit: 0.6, golden: 1, fullness: 0.75, vibrance: 1, milestone: 0, data: false,
  captions: ["Decorative orchard — select an account to let it reflect real progress."],
};

export function growthFromSummary(s: Summary | undefined): Growth {
  if (!s) return DECORATIVE_GROWTH;
  const progress = Math.max(0, Math.min(1, s.metrics.emergency_fund_progress ?? 0));
  const coverage = s.metrics.coverage_months ?? 0;
  const golden = progress >= 1 ? Math.min(3, Math.floor(coverage / 3)) : 0;
  const score = s.resilience.score;
  const flow = s.metrics.avg_monthly_cash_flow;
  const captions = [
    `🍊 Tangerines show ${Math.round(progress * 100)}% of the 3-month emergency fund target.`,
    golden > 0
      ? `✨ ${golden} golden tangerine${golden > 1 ? "s" : ""}: ${golden * 3}+ months of spending saved.`
      : "✨ Golden tangerines appear when the 3-month goal is reached.",
    `🌳 Canopy fullness follows the resilience score (${Math.round(score)}/100).`,
    flow >= 0 ? "☀️ Positive average cash flow keeps the orchard glowing." : "🌤️ The light warms up as average cash flow turns positive.",
  ];
  return {
    fruit: progress, golden, fullness: score / 100, vibrance: flow >= 0 ? 1 : 0.55,
    milestone: Math.floor(progress * 4 + 1e-9), data: true, captions,
  };
}
