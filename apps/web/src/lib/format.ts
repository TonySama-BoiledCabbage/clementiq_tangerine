const cad0 = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const cad2 = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Privacy mode: when on, every formatted amount is replaced, so the real value never reaches the DOM,
 *  tooltips, chart labels or accessible names. Set by the app shell from the user's preference. */
export const MASK = "••••";
let masked = false;
export function setMoneyMask(on: boolean): void { masked = on; }
export function isMoneyMasked(): boolean { return masked; }

/** Presentation-only rounding: the backend keeps full precision. */
export function money(v: number | null | undefined, cents = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (masked) return `$${MASK}`;
  return (cents ? cad2 : cad0).format(v);
}

export function signedMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (masked) return `$${MASK}`;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v));
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function num(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-CA", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function compactMoney(v: number): string {
  if (masked) return MASK;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { dateStyle: "medium" });
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-CA", { month: "short", year: "2-digit" });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Text for read-aloud: replaces dollar amounts unless the user explicitly allows speaking them. */
export function speakable(text: string, readAmounts: boolean): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return readAmounts ? clean : clean.replace(/[−-]?\$\s?(?:[\d,]+(?:\.\d+)?|••••)/g, "an amount");
}
