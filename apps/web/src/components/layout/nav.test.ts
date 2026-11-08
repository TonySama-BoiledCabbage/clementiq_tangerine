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
    expect(hrefs).toEqual(["/home", "/plan", "/what-if", "/more"]);
    expect(isStaff("customer")).toBe(false);
  });
  it("gives staff Accounts, Stress Test, Findings, More", () => {
    expect(tabsFor("judge").map((t) => t.label)).toEqual(["Accounts", "Stress Test", "Findings", "More"]);
  });
});
