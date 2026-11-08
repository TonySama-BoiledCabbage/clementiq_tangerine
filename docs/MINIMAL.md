# Minimal / 极简 product

Primary checkout: ui-redesign. UI belongs to the user. API: services/api/clementiq; web: apps/web/src.

## Owners
- Identity/search: auth.py, repository.py, routers/system.py and accounts.py; web store.ts, AppShell, CustomerSelector.
- Shared drafts: web lib/analysis.ts + store.ts + hooks.ts. Scenario/goal parameters are account-scoped, in-memory; API results stay in Query. Sign-out clears identity data. Custom drafts are not promised to survive reload; saved scenarios preserve full spec.
- Calculations: core/metrics.py, runway.py, shocks.py, recovery.py (unchanged formulas). Payment coverage: accounts router. Risk presentation and plan views: components/stress/parts.tsx.
- AI: ai/service.py + gemini.py + routers/ai.py. User-requested only; privacy.personalized_ai before cache; cache includes identity, model/Core/prompt/schema version; successful output retains usage. Ordinary alerts use explain=0. Budget env: AI_MAX_OUTPUT_TOKENS / AI_CHAT_MESSAGES / AI_MAX_PROMPT_CHARS / AI_TOOL_ROUNDS.
- Notifications: alerts/service.py + jobs.py; web alerts/links.ts maps old alert links into role-appropriate workflows. One preferences form in Settings.
- Reading/terms: components/ui/reading.tsx; browser speech only, no paid TTS, autoplay, masking or separate Calm mode.
- Operations: admin page + OperationsStatus; judge may view dataset status, only admin executes imports/reads audit. Personal demo scenarios do not change bank source records.

## Scope
Accounts → current account → simulation + Backup, with a separate long-term Goal. Findings is portfolio-wide. Customer sees only bound account. PDF/Excel export deferred at user request to avoid new dependencies. Optional WorldPulse/investments/Solana/score/timeline/avatar/standalone advisor not promoted into primary navigation. Real bank goal setup/transfers are not implemented.

Default copy states facts → impact → next step → evidence/limits. Historical month-end records are not live balances. Long runway never cancels payment/loan warnings.

## Checks
PowerShell uses npm.cmd. npm.cmd run lint:web; npm.cmd run typecheck; npm.cmd run test:web; npm.cmd run build:web. Backend: services/api/.venv/Scripts/python.exe -m pytest -q --tb=short (from repo root). Existing optional-page warnings are separate from failures. Add focused checks for authorization, money or cross-page context changes; don't duplicate whole suites for copy edits.
