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
