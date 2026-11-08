/**
 * Design registry. To add a design: drop `<id>.css` here (see README.md), import it in globals.css,
 * and add one line to DESIGNS. Switch at runtime with `?design=<id>` (remembered), `?design=reset` to clear.
 * Deploy-time default: NEXT_PUBLIC_DESIGN=<id>.
 */
export const DESIGNS = [
  { id: "fold", label: "Fold — Bauhaus poster on fog" },
  { id: "ios27", label: "iOS 27 — grouped background, glass chrome" },
] as const;

export type DesignId = (typeof DESIGNS)[number]["id"];

const ids = DESIGNS.map((d) => d.id) as string[];
const fromEnv = process.env.NEXT_PUBLIC_DESIGN;
export const DEFAULT_DESIGN: DesignId = (fromEnv && ids.includes(fromEnv) ? fromEnv : "fold") as DesignId;
export const DESIGN_STORAGE_KEY = "clementiq-design";

/** Inline <head> script: runs before first paint so there is no flash of the wrong design. */
export function designBootScript(): string {
  return `(function(){var d=${JSON.stringify(DEFAULT_DESIGN)},ids=${JSON.stringify(ids)},k=${JSON.stringify(DESIGN_STORAGE_KEY)};try{var q=new URLSearchParams(location.search).get("design");if(q==="reset")localStorage.removeItem(k);else if(q&&ids.indexOf(q)>-1)localStorage.setItem(k,q);var s=localStorage.getItem(k);if(s&&ids.indexOf(s)>-1)d=s;}catch(e){}document.documentElement.setAttribute("data-design",d);})();`;
}
