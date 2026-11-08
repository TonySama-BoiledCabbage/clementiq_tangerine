# Minimal product maintenance

Read docs/MINIMAL.md first, then only the module and callers needed for the task. The local ui-redesign checkout is the primary version (called Minimal / 极简). User owns visual design.

- Preserve existing financial definitions and Core results. Authorization, accessibility and risk clarity are mandatory.
- Reuse current modules, dependencies and token contract. Avoid broad file moves, duplicate formulas, or new frameworks.
- Model API cost and Agent context/modification cost both matter. Default workflows use deterministic text; AI stays manual, consent-aware and cached.
- No balance masking, Calm mode, orchard or layout customization. Clear, respectful, explicit risk language is the default.
- PDF/XLSX export is deferred: user declined new backend dependencies. Do not add dormant export UI.
- Preserve unrelated working-tree changes. Check relevant tests; run frontend lint/build after each functional batch.
- Read apps/web/AGENTS.md and the installed Next.js guide before Next changes. Keep maintenance handoffs short.
