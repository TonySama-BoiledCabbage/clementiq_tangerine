# ClementIQ — handoff for Claude Code

Sheridan Datathon 2026, Tangerine track "Resilience Rewired" (Nov 7–8, 2026). Team product: ClementIQ.
Owner on this machine: Tony (Yuntao Lu). Talk to him in Chinese unless he writes in English; keep code, commits and UI copy in English.

This file was written at the end of a claude.ai session (Nov 7, 23:30 Toronto) that did the UI/IA work on branch `ui-redesign`.
Read it fully before changing anything.

## 0. First thing to do

The session edited files directly on this machine but committed in its own sandbox, so **the local git does not have those commits yet**.
The working tree already matches the sandbox (40/41 files byte-identical; `package-lock.json` differs only because `npm install` on Windows regenerated it — keep the local one).

```powershell
git status                      # expect: on ui-redesign, many modified/untracked files under apps/web and services/api
git add -A
git commit -m "UI redesign + role-based IA (from claude.ai session): see CLAUDE.md"
```

Sandbox history, for reference (same content as the working tree):
`f79bcf0` judging-path IA + theme → `ecd6f54` iOS tab bar → `90f1b3b` iOS 27 redesign + obligations check →
`3465c8e` role-based IA (Accounts, customer Home/Plan/What if) → `8378503` translate opt-out + Profile overflow → `5251331` DOM guard for translation crashes.

## 1. Run, test, build (Windows / PowerShell)

PowerShell blocks `npm.ps1`, so always type `npm.cmd`.

```powershell
npm.cmd run dev          # repo root: FastAPI :8000 + Next.js :3000 (scripts/dev.mjs); npm.cmd run stop if ports are stuck
npm.cmd run test:web     # vitest (6 tests)
npm.cmd run typecheck
npm.cmd --workspace apps/web run lint     # eslint 9 flat config; must stay at 0 errors (11 known warnings)
npm.cmd run build:web
cd services\api; .venv\Scripts\python -m pytest -q    # 71 tests
```

Demo logins (http://localhost:3000/login): judge `tangerine-judge` · admin `tangerine-admin` · customer `tangerine-customer` + an account id.
Good demo accounts: **95678** (short this month, loan behind, thin buffer), **20176** (stable, fully covered), **37897** (top of Needs attention).
After a `layout.tsx` change, hard-refresh (Ctrl+Shift+R): the DOM guard script only runs on a full load.

## 2. Non-negotiables

- **Judge formula is fixed** (README "Judging Mode"): I = median(money_in), S = median(money_out), F = median(bills+insurance+loans),
  H = median(household_bills), B = mean avg_daily_balance over the last 6 rows, P = monthly_payment if loan status C or D;
  runway = (B − one_off) / (spend_after − income_after), capped at 120, 1 decimal. The engine was checked against an independent
  recomputation on all 4,500 accounts × the 3 README twist cards. Do not change `core/runway.py` / shock math.
- **Flags are for outreach and help, never credit decisions.** That sentence ships in the API response and the UI; keep it.
- **Data is the Czech PKDD'99 bank dataset relabelled by the organisers.** Say so if asked; never present it as Canadian customers.
- **No made-up numbers.** Every figure on screen comes from the API. If you quote a statistic in a pitch or doc, recompute it.

## 3. Product and information architecture

B2B2C on one engine. Staff (advisor = `admin`, `judge`) start from *who needs help*; customers start from *am I OK this month*.

| Role | "/" goes to | Tabs (phone) / sidebar | More |
|---|---|---|---|
| customer | `/home` | Home · Plan · What if · More | Account details (`/dashboard`), Settings |
| admin (advisor) | `/accounts` | Accounts · Stress Test · Findings · More | Customer Profile, Advanced Simulator, Recovery Plans, Settings, Data Import |
| judge | `/judge` | same as admin | same, minus Data Import |

- Routing lives in `apps/web/src/components/layout/nav.ts` (`homeFor`, `navFor`, `moreFor`, `tabsFor`) and
  `useRoleGate.ts` (customers are bounced off staff pages and vice versa). Tested in `nav.test.ts`.
- **Stress Test** (`app/(app)/judge/page.tsx`, staff): summary strip (I, S, B, P, runway, risk flags, Profile link) →
  twist-card segmented control (3 README cards + mortgage renewal +6%, "More" opens the full selector) → result directly beneath →
  Goal Plan + Backup Plan side by side → disclosures (payments vs balance auto-opens when short/behind; README inputs; formula check; AI explanation).
- **Accounts** (`app/(app)/accounts/page.tsx`): `GET /api/insights/needs-attention`, filter chips, paging, help-not-credit footer.
- **Findings** (`app/(app)/insights/page.tsx`): leads with "risk the formula can't see" + top 5, then the original portfolio charts.
- **Customer**: `home/` (Right now → safety net → fragile nudge to What if when EI-55 runway < 6 mo), `plan/` (Goals + Automatic
  Savings Program wording; "Set up this Goal" is a disabled **Concept** button), `what-if/` (scenario chips → result → do this first; `?scenario=` preselects).
- Old pages (worldpulse, map, investments, solana, advisor, timeline, alerts, resilience) still exist as routes but are deliberately unlinked.

### Shared logic — one source of truth
`apps/web/src/components/stress/parts.tsx` holds every risk/tone/wording rule used by both staff and customer screens:
`riskOf`, `anyRisk`, `runwayTone` (never green while a risk flag is on), `edgeCases`, `backupSteps` (lender first when behind/short;
cuts > 60% replaced by deferral + EI), `ei55Runway`, and the components `ShockPicker`, `NowCard`, `GoalCard`, `ResultView`, `BackupView`,
`TypicalMonth`, `Section`, `Disclosure`, `Note`, `Row`, plus hooks `useShock`, `useAccountExtras`. Change rules here, not per page.
The flag rules must match the backend `services/api/clementiq/core/attention.py` (short / behind / thin; severity short > behind > thin).

### Backend additions in this branch
- `GET /api/accounts/{id}/obligations`: standing orders + running loan vs latest month-end balance → `covered | tight | short`, loan status, notes.
- `GET /api/insights/needs-attention?limit&offset&flag=short|behind|thin` (staff only, cached per import fingerprint).
  Real data: 228 of 4,419 active accounts (5.2%) flagged; short 65, behind 45, thin 181; 82 of the 228 look safe under the formula alone
  (I ≥ S and B > 0). Those 82 are the pitch's headline.
- `GET /api/insights` is now staff only; `GET /admin/imports` requires admin.
- Twist preset `mortgage_renewal` (loan payment +6%; 2026 renewals averaged roughly that per BoC/TD — don't oversell).

## 4. Design system (iOS 27 look, light only)

Tokens in `apps/web/src/app/globals.css` (names kept from the old theme for compatibility): `--tangerine` is the accent **#0071e3**,
page `#f2f2f7`, ink `#1d1d1f / #48484a / #6e6e73`, lines `#e5e5ea`, status good `#248a3d` / bad `#d70015` / warn `#b25000` with `*-bg`.
Cards 22px radius, no border; capsule buttons; 44pt minimum hit targets; Liquid Glass (`.glass`) only on floating chrome (top bar, tab bar).
Classes: `.large-title` (34px), `.display-num` (64px), `.marker` (highlighter), `.tabular`.
On phones the floating tab bar is `position: fixed`; anything wider than the viewport pushes it off screen — use `min-w-0` on grid children.

## 5. Gotchas

- **Browser translation crashes React** ("Failed to execute 'removeChild'/'insertBefore' on 'Node'"). Fixed three ways: `translate="no"`
  on `<html>`, a DOM guard script in `app/layout.tsx` (facebook/react#11538), and no conditional elements next to bare text in
  toggling UI (wrap text in `<span>`, or key the block). Keep that pattern in new components. Demo with translation off.
- Next 16 removed `next lint`; lint is plain `eslint .` with `eslint.config.mjs` (`react-hooks/set-state-in-effect` is a warning).
- Page files (`page.tsx`) may only export the page; shared types go in a module (see `components/stress/attention.ts`).
- `useSearchParams` is fine in pages because `AppShell` wraps children in `<Suspense>`.
- API rate limits bite on bulk calls; for batch checks call the Python functions directly with `session_factory()`.
- The `customer` role is bound to one account (`useAccount()` returns the bound id); staff pick any account via `?account=`.

## 6. Open items (ask Tony before starting large ones)

1. Commit the working tree (section 0); optionally push `ui-redesign` and open a PR to the teammate's repo.
2. Customer Profile (`dashboard/page.tsx`) and Findings charts still use the older type scale (text-xs, small chips); restyle to the tokens above.
3. Demo script for the 5-minute judging slot: Accounts → 37897/95678 → twist cards → plans → Findings "82" → switch to customer 95678 on a phone width.
4. AI explanation needs `GEMINI_API_KEY` in the repo-root `.env` (see `.env.example`); without it the template fallback is used — check which one the demo shows.
5. Before the demo: run every check in section 1, click through all three roles on desktop and a 390px phone width, browser translation off.

Team docs (claude.ai): "ClementIQ 产品 Brief" (bilingual product brief, section 11 = this IA and its gap table) and "Datathon 队伍简报".
