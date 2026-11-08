"use client";
import { scenarioDraft, goalDraft, type ScenarioDraft, type GoalDraft } from "./analysis";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Role = "judge" | "customer" | "admin";

interface Session {
  scenario: ScenarioDraft | null;
  goalSettings: GoalDraft | null;
  setScenario: (accountId: number, patch: Partial<ScenarioDraft>) => void;
  setGoalSettings: (accountId: number, patch: Partial<GoalDraft>) => void;
  token: string | null;
  role: Role | null;
  sub: string | null;
  boundAccount: number | null;
  expiresAt: string | null;
  accountId: number | null; // currently selected customer
  recentAccounts: number[]; // last accounts opened (newest first), for quick re-selection in the demo
  mobileNavOpen: boolean;
  advisorOpen: boolean;
  setSession: (s: { token: string; role: Role; sub: string; account_id: number | null; expires_at: string }) => void;
  logout: () => void;
  verifyIdentity: (s: { role: Role; sub: string; account_id: number | null }) => void;
  setAccount: (id: number | null) => void;
  setMobileNav: (v: boolean) => void;
  setAdvisorOpen: (v: boolean) => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const t = "__ciq";
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
});

export const useSession = create<Session>()(
  persist(
    (set) => ({
      scenario: null, goalSettings: null,
      setScenario: (id, patch) => set((s) => ({ scenario: { ...(s.scenario?.account_id === id ? s.scenario : scenarioDraft(id)), ...patch, account_id: id } })),
      setGoalSettings: (id, patch) => set((s) => ({ goalSettings: { ...(s.goalSettings?.account_id === id ? s.goalSettings : goalDraft(id)), ...patch, account_id: id } })),
      token: null, role: null, sub: null, boundAccount: null, expiresAt: null, accountId: null, recentAccounts: [],
      mobileNavOpen: false, advisorOpen: true,
      setSession: (s) => set({ scenario: null, goalSettings: null, token: s.token, role: s.role, sub: s.sub, boundAccount: s.account_id, expiresAt: s.expires_at,
                               accountId: s.account_id ?? null, recentAccounts: [] }),
      verifyIdentity: (s) => set((current) => ({ role: s.role, sub: s.sub, boundAccount: s.account_id,
        accountId: s.role === "customer" ? s.account_id : current.accountId })),
      logout: () => set({ scenario: null, goalSettings: null, token: null, role: null, sub: null, boundAccount: null, expiresAt: null, accountId: null, recentAccounts: [], mobileNavOpen: false }),
      setAccount: (id) => set((s) => ({ accountId: id,
        recentAccounts: id == null ? s.recentAccounts : [id, ...s.recentAccounts.filter((x) => x !== id)].slice(0, 5) })),
      setMobileNav: (v) => set({ mobileNavOpen: v }),
      setAdvisorOpen: (v) => set({ advisorOpen: v }),
    }),
    { name: "clementiq-session", storage: safeStorage,
      partialize: (s) => ({ token: s.token, role: s.role, sub: s.sub, boundAccount: s.boundAccount, expiresAt: s.expiresAt,
                            accountId: s.accountId, recentAccounts: s.recentAccounts, advisorOpen: s.advisorOpen }) },
  ),
);
