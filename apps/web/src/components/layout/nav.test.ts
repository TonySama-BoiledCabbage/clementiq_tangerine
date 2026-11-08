import { describe, expect, it } from "vitest";
import { homeFor, isStaff, tabsFor } from "./nav";

describe("role-based navigation", () => {
  it("sends each role to its own start page", () => {
    expect(homeFor("customer")).toBe("/home");
    expect(homeFor("admin")).toBe("/accounts");
    expect(homeFor("judge")).toBe("/judge");
  });
  it("never shows staff pages in the customer tab bar", () => {
    const hrefs = tabsFor("customer").map((t) => t.href);
    expect(hrefs).toEqual(["/home", "/plan", "/what-if", "/dashboard", "/more"]);
    expect(isStaff("customer")).toBe(false);
  });
  it("gives staff a direct Profile tab", () => {
    expect(tabsFor("judge").map((t) => t.label)).toEqual(["Accounts", "Stress Test", "Findings", "Profile", "More"]);
  });
  it("selects details independently from More for every role", () => {
    for (const role of ["customer", "judge", "admin"] as const) {
      const tabs = tabsFor(role);
      expect(tabs).toHaveLength(5);
      expect(tabs.find((t) => t.href === "/dashboard")?.label).toBe(role === "customer" ? "Details" : "Profile");
      expect(tabs.find((t) => t.href === "/more")?.match).not.toContain("/dashboard");
    }
  });
});
