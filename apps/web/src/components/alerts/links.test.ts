import { it, expect } from "vitest";
import { alertLink } from "./links";
it("restores alert context in the current role's task", () => {
  const alert = { account_id: 1001, simulation_link: "/simulator?preset=ei55_6m&account=1001" };
  expect(alertLink(alert, "customer")).toBe("/what-if?scenario=ei55_6m");
  expect(alertLink(alert, "judge")).toBe("/simulator?account=1001&preset=ei55_6m");
  expect(alertLink({ ...alert, simulation_link: null }, "customer")).toBe("/home");
});
