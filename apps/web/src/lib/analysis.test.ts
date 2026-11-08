import { describe, it, expect } from "vitest";
import { useSession } from "./store";
import { goalRequest } from "./analysis";

describe("analysis context boundaries", () => {
  it("keeps full scenario parameters, scopes goals and clears identity data", () => {
    const s = useSession.getState();
    s.setSession({ token: "one", role: "judge", sub: "judge:one", account_id: null, expires_at: "2099-01-01" });
    s.setAccount(1001);
    s.setScenario(1001, { components: [{ type: "bill_inflation", pct: 23 }], mode: "extended", horizon_months: 36, discretionary_cut_pct: 15 });
    expect(useSession.getState().scenario).toMatchObject({ account_id: 1001, mode: "extended", horizon_months: 36, discretionary_cut_pct: 15 });
    s.setGoalSettings(1001, { target_months: 6, deadline_months: 0 });
    expect(goalRequest(useSession.getState().goalSettings!)).toMatchObject({ target_months: 6, deadline_months: null });
    s.setScenario(1002, { components: [{ type: "emergency_expense", amount: 400 }] });
    expect(useSession.getState().scenario).toMatchObject({ account_id: 1002, mode: "judging", horizon_months: 24, discretionary_cut_pct: 0 });
    s.logout();
    expect(useSession.getState()).toMatchObject({ scenario: null, goalSettings: null, recentAccounts: [], accountId: null });
    s.setSession({ token: "two", role: "customer", sub: "customer:1002", account_id: 1002, expires_at: "2099-01-01" });
    expect(useSession.getState()).toMatchObject({ accountId: 1002, boundAccount: 1002, scenario: null });
    s.logout();
  });
});
