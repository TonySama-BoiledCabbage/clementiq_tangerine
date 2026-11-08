import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTRAST_PAIRS, REQUIRED_TOKENS } from "./contract";
import { DEFAULT_DESIGN, DESIGNS } from "./index";

/** Read `:root[data-design="id"] { --name: value; … }` out of src/themes/<id>.css. */
function tokensOf(id: string): Record<string, string> {
  const css = readFileSync(fileURLToPath(new URL(`./${id}.css`, import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = css.match(new RegExp(`:root\\[data-design="${id}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`${id}.css has no :root[data-design="${id}"] block`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("designs", () => {
  it("registry has a valid default", () => {
    expect(DESIGNS.map((d) => d.id)).toContain(DEFAULT_DESIGN);
  });

  describe.each(DESIGNS.map((d) => d.id))("%s", (id) => {
    const t = tokensOf(id);

    it("defines every token in the contract", () => {
      expect(REQUIRED_TOKENS.filter((name) => !(name in t))).toEqual([]);
    });

    it("keeps text readable (WCAG AA 4.5:1)", () => {
      const failing = CONTRAST_PAIRS.map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(t[fg], t[bg]) }))
        .filter((p) => p.ratio < 4.5)
        .map((p) => `${p.pair} = ${p.ratio.toFixed(2)}`);
      expect(failing).toEqual([]);
    });

    it("has white label contrast on the action fill", () => {
      expect(contrast("#ffffff", t.tangerine)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
