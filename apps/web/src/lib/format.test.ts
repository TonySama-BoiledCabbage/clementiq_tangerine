import { describe, expect, it } from "vitest";
import { ShockRequestSchema, SolanaAddressSchema } from "@clementiq/shared-types";
import { money, monthLabel, pct, signedMoney } from "./format";

describe("format", () => {
  it("rounds only for presentation", () => {
    expect(money(1234.567)).toBe("$1,235");
    expect(money(1234.567, true)).toBe("$1,234.57");
    expect(money(null)).toBe("—");
    expect(signedMoney(-50)).toBe("−$50");
    expect(pct(0.355)).toBe("36%");
    expect(monthLabel("2025-12")).toMatch(/Dec/);
  });
});

describe("shared schemas", () => {
  it("validates shock requests", () => {
    expect(ShockRequestSchema.safeParse({ account_id: 1, components: [{ type: "job_loss", income_replacement_pct: 55 }] }).success).toBe(true);
    expect(ShockRequestSchema.safeParse({ account_id: 1, components: [] }).success).toBe(false);
    expect(ShockRequestSchema.safeParse({ account_id: 1, components: [{ type: "job_loss", income_replacement_pct: 150 }] }).success).toBe(false);
  });
  it("pre-validates Solana addresses", () => {
    expect(SolanaAddressSchema.safeParse("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").success).toBe(true);
    expect(SolanaAddressSchema.safeParse("0xabc").success).toBe(false);
  });
});

describe("privacy mode and read-aloud", () => {
  it("masks every amount, including compact chart labels", async () => {
    const f = await import("./format");
    f.setMoneyMask(true);
    expect(f.money(17611.86)).toBe("$••••");
    expect(f.signedMoney(-2260)).toBe("$••••");
    expect(f.compactMoney(30000)).toBe("••••");
    expect(f.money(null)).toBe("—");
    f.setMoneyMask(false);
    expect(f.money(17611.86)).toBe("$17,612");
  });
  it("never speaks amounts unless allowed", async () => {
    const { speakable } = await import("./format");
    const t = "Income is $6,339 and spending is $8,600.50; masked $•••• too.";
    expect(speakable(t, false)).toBe("Income is an amount and spending is an amount; masked an amount too.");
    expect(speakable(t, true)).toContain("$6,339");
  });
});
