/**
 * The token contract: every design in `themes/*.css` must define ALL of these custom properties.
 * Components only read these names (via Tailwind utilities or var()), never a design's own palette,
 * so adding a design = adding one CSS file that fills this list. `themes.test.ts` enforces it.
 *
 * Names are kept from the original theme (`--tangerine` is "the action colour", not literally orange).
 */
export const TOKEN_CONTRACT = {
  // Surfaces and text
  surface: ["page", "surface", "cream", "peach", "field", "track", "press", "hero-bg"],
  text: ["ink", "ink-2", "ink-3", "link", "chevron"],
  lines: ["line", "line-strong", "grid"],
  // The one action colour (primary button fill, selected state, links' underline)
  action: ["tangerine", "tangerine-bright", "accent-tint", "highlight"],
  // Status carries meaning (CLAUDE.md §2: never green while a risk flag is on). Designs may re-tone, not remove.
  status: ["good", "good-bg", "bad", "bad-bg", "warn", "warn-bg", "invest"],
  charts: ["series-1", "series-2", "series-3", "series-4"],
  // Shape and elevation (Tailwind `rounded-md|xl|2xl|3xl` and `shadow-card` resolve to these)
  shape: ["r-tile", "r-card", "r-panel"],
  elevation: ["elev-card"],
  // Typography
  type: ["font-sans", "font-display", "tracking-body", "tracking-title", "tracking-num"],
  // Floating chrome (top bar, tab bar)
  chrome: ["glass-bg", "glass-edge", "glass-shadow", "glass-blur"],
} as const;

export const REQUIRED_TOKENS: readonly string[] = Object.values(TOKEN_CONTRACT).flat();

/** Text/background pairs that must reach WCAG AA (4.5:1). [foreground token, background token] */
export const CONTRAST_PAIRS: readonly (readonly [string, string])[] = [
  ["ink", "page"], ["ink", "surface"],
  ["ink-2", "surface"], ["ink-2", "page"],
  ["ink-3", "surface"], ["ink-3", "page"],
  ["link", "surface"], ["link", "page"],
  ["good", "good-bg"], ["bad", "bad-bg"], ["warn", "warn-bg"],
];
