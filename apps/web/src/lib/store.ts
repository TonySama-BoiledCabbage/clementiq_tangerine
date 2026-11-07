"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Role = "judge" | "customer" | "admin";

interface Session {
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
      token: null, role: null, sub: null, boundAccount: null, expiresAt: null, accountId: null, recentAccounts: [],
      mobileNavOpen: false, advisorOpen: true,
      setSession: (s) => set({ token: s.token, role: s.role, sub: s.sub, boundAccount: s.account_id, expiresAt: s.expires_at,
                               accountId: s.account_id ?? null }),
      logout: () => set({ token: null, role: null, sub: null, boundAccount: null, expiresAt: null, accountId: null }),
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
