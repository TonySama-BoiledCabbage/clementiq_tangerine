# Designs (themes)

One design = one CSS file that fills the token contract. Pages and components never know which design is active.

```
contract.ts     list of tokens every design must define (+ contrast pairs that must reach AA)
index.ts        registry (DESIGNS, DEFAULT_DESIGN) and the pre-paint boot script
<id>.css        :root[data-design="<id>"] { --token: value; … }
specs/<id>.DESIGN.md   the source style reference the design was built from
themes.test.ts  runs the contract + contrast checks on every registered design
```

## Use / switch

| How | Effect |
|---|---|
| `http://localhost:3000/?design=ios27` | switch and remember (localStorage `clementiq-design`) |
| `?design=reset` | forget the choice, back to the default |
| `NEXT_PUBLIC_DESIGN=ios27` in `.env` | deploy-time default (restart `npm run dev`) |

Active design = `<html data-design="…">`, set by an inline script before first paint (no flash).

## Add a design (≈ 30 min)

1. Save the style reference to `specs/<id>.DESIGN.md`.
2. Copy `fold.css` to `<id>.css`, change the selector to `:root[data-design="<id>"]`, fill every token.
   Put a header comment listing **deviations from the spec and why** (see `fold.css`).
3. `@import "../themes/<id>.css";` in `app/globals.css`.
4. Add `{ id: "<id>", label: "…" }` to `DESIGNS` in `index.ts`.
5. `npm.cmd run test:web` — fails if a token is missing or text contrast < 4.5:1.
6. Look at it: Accounts, Stress Test (staff) and Home, What if (customer, 390px phone width).

## Rules that keep this cheap

- **No colour / radius / shadow / font literals in components.** Use the Tailwind names that map to tokens:
  colours (`bg-surface`, `text-ink-3`, `bg-field`, `bg-track`, `bg-accent-tint`, `bg-tangerine`…),
  `rounded-md|lg|xl` (inset tile), `rounded-2xl` (card), `rounded-3xl` (panel), `rounded-full` (capsule),
  `shadow-card`, `.glass`, `.hero-bg`, `.large-title`, `.display-num`.
  Exceptions that are allowed to stay literal: brand logo, 3D scenes/maps, tiny inner radii (≤ 11px), slider/switch thumbs.
- **Status colours carry meaning** (good / warn / bad, plus icon or words). A design may re-tone them, not drop them.
  Flag rules live in `components/stress/parts.tsx`, not in a design.
- **A design changes how things look, not what they say.** No design may alter numbers, flags, or the
  "flags are for outreach and help, never credit decisions" sentence (CLAUDE.md §2).

## Not in the contract yet (add when a design needs it)

Per-design font files (`@font-face`), icon stroke weight, illustration set, motion, dark mode (`data-theme="dark"` is a
separate axis and is still light-only), per-design `themeColor` meta.
