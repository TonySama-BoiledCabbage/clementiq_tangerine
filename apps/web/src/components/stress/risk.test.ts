import { expect, it } from "vitest";
import type { Judging, Runway } from "@clementiq/shared-types";
import { riskOf, runwayTone } from "./parts";
it("does not label missing data or overdue payments safe just because runway is long", () => {
  const runway = { status: "finite", months: 12, no_shortfall: false } as Runway;
  expect(runwayTone(runway, undefined, riskOf(undefined, undefined))).toBe("warn");
  const j = { I: 100, S: 80, B: 1000 } as Judging;
  expect(runwayTone(runway, j, { unknown: false, thinBuffer: false, loanBehind: true, pastDefault: false, shortThisMonth: false })).toBe("bad");
});
