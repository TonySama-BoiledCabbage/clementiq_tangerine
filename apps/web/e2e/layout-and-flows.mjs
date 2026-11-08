/**
 * ClementIQ end-to-end layout & flow checks (Playwright).
 *
 *   1. Start the app:   npm run dev            (API :8000, web :3000)
 *   2. Run:             npm run test:e2e        (or: BASE=http://localhost:3010 node apps/web/e2e/layout-and-flows.mjs)
 *
 * Uses the installed Microsoft Edge (channel "msedge"); set PW_CHANNEL=chromium to use Playwright's Chromium.
 * Test users are named "e2e-…" and are signed in with the development judge/customer access codes.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const ACCOUNT = Number(process.env.ACCOUNT || 20111);
const CODES = { judge: process.env.JUDGE_CODE || "tangerine-judge", customer: process.env.CUSTOMER_CODE || "tangerine-customer" };
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL === "chromium" ? undefined : "msedge" });

async function login(ctx, { role = "judge", name = "e2e-judge", account } = {}) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  if (role === "customer") {
    await p.getByRole("radio", { name: /Customer/ }).click();
    await p.getByLabel("account_id").fill(String(account));
    await p.getByLabel("Access code").fill(CODES.customer);
  } else {
    await p.getByLabel("Your name (optional)").fill(name);
    await p.getByLabel("Access code").fill(CODES.judge);
  }
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(`${BASE}/`, { timeout: 60000 });
  await p.getByText("Choose a focus area").waitFor({ timeout: 60000 });
  return p;
}

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const t = JSON.parse(localStorage.getItem("clementiq-session")).state.token;
    const r = await fetch(`/api${path}`, { method, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: r.headers.get("content-type")?.includes("json") ? await r.json() : null };
  }, { method, path, body });
}

/** Boxes of the four home sections plus every card; verifies vertical order and no overlaps. */
async function homeLayout(page) {
  return page.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right }; };
    const cards = [...document.querySelectorAll("article.pal-card")].map(box);
    return {
      hero: box(document.querySelector('[aria-labelledby="hero-title"]')),
      explain: box(document.getElementById("orchard-explained")),
      toolbar: box(document.querySelector('[role="toolbar"][aria-label="Dashboard layout"]')),
      cards,
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    };
  });
}
const overlaps = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

function verifyLayout(label, L) {
  const seq = [L.hero, L.explain, L.toolbar, L.cards[0]].filter(Boolean);
  const ordered = seq.every((b, i) => i === 0 || b.top >= seq[i - 1].bottom - 1);
  let cardOverlap = false;
  for (let i = 0; i < L.cards.length; i++) for (let j = i + 1; j < L.cards.length; j++) if (overlaps(L.cards[i], L.cards[j])) cardOverlap = true;
  check(`${label}: hero → explanation → controls → cards in order, no overlap`, ordered && !cardOverlap, `${L.cards.length} cards`);
  check(`${label}: no horizontal scrolling`, L.scrollW <= L.innerW + 1, `${L.scrollW} vs ${L.innerW}`);
}

// ── Layout at required widths, 200% zoom (half-width viewport at 2× scale) and extra-large text ──
{
  const sizes = [[375, 812], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [720, 450, 2]];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await login(ctx, { name: "e2e-layout" });
  await api(page, "PATCH", "/settings", { dashboard: { features: { worldPulse: true, insights: true, financialTimeline: true } } });
  for (const [w, h, scale] of sizes) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale || 1, storageState: await ctx.storageState() });
    const p = await c.newPage();
    await p.goto(`${BASE}/?account=${ACCOUNT}`);
    await p.getByText("Choose a focus area").waitFor();
    const toggle = p.getByRole("button", { name: /How your orchard grows/ });
    if (await toggle.count()) await toggle.click();
    await p.waitForTimeout(400);
    verifyLayout(scale ? `${w * scale}px at 200% zoom` : `${w}px`, await homeLayout(p));
    if (w === 1440) {
      const card = p.locator("article.pal-card").first();
      await card.scrollIntoViewIfNeeded();
      const bb = await card.boundingBox();
      const hit = await p.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("article.pal-card"), { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
      check("decorative layers never block clicks on cards", hit);
    }
    await c.close();
  }
  await api(page, "PATCH", "/settings", { accessibility: { text_size: "x-large" } });
  const c = await browser.newContext({ viewport: { width: 1024, height: 768 }, storageState: await ctx.storageState() });
  const p = await c.newPage();
  await p.goto(`${BASE}/?account=${ACCOUNT}`);
  await p.getByText("Choose a focus area").waitFor();
  await p.waitForTimeout(500);
  check("extra-large text applied", (await p.evaluate(() => document.documentElement.dataset.textSize)) === "x-large");
  verifyLayout("1024px with extra-large text", await homeLayout(p));
  await api(page, "PATCH", "/settings", { accessibility: { text_size: "default" } });
  await c.close();
  await ctx.close();
}

// ── Navigation, customization sync, profile/settings, privacy, reports (judge) ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await login(ctx, { name: "e2e-flows" });
  await page.goto(`${BASE}/?account=${ACCOUNT}`);
  await page.getByText("Choose a focus area").waitFor();
  check("top bar has no Settings or Customize buttons",
    (await page.getByRole("link", { name: /^Settings$/ }).count()) === 0 && (await page.getByRole("link", { name: /Customize/ }).count()) === 0);
  await page.getByRole("button", { name: /Account menu/ }).click();
  const items = (await page.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  check("profile menu is exactly My Profile, Settings, Sign Out", JSON.stringify(items) === JSON.stringify(["My Profile", "Settings", "Sign Out"]), items.join(" | "));
  await page.getByRole("menuitem", { name: "My Profile" }).click();
  await page.waitForURL(/\/profile$/);
  check("My Profile is its own page", (await page.getByRole("heading", { name: "My Profile", level: 1 }).count()) === 1);
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForURL(/\/settings/);
  check("Settings is a separate page", (await page.getByRole("heading", { name: "Settings", level: 1 }).count()) === 1);

  // Hide a feature: it disappears from Home AND the switcher without a refresh, then comes back.
  await page.goto(`${BASE}/settings?section=dashboard`);
  await page.getByLabel("Show Recovery Plans on my dashboard").waitFor();
  const toggle = page.getByLabel("Show Recovery Plans on my dashboard");
  if ((await toggle.getAttribute("data-state")) !== "checked") await toggle.click();
  await toggle.click();      // now OFF
  await page.waitForTimeout(500);
  await page.getByRole("link", { name: /Back to Home/ }).click();
  await page.getByText("Choose a focus area").waitFor();
  const homeCards = await page.locator("article.pal-card h3").allInnerTexts();
  await page.locator("article.pal-card h3 a").first().click();
  await page.getByRole("button", { name: "Switch feature" }).click();
  const switcher = (await page.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press("Escape");
  check("hidden feature removed from Home", !homeCards.includes("Recovery Plans"), homeCards.join(", "));
  check("switcher shows exactly the enabled features in card order", JSON.stringify(switcher) === JSON.stringify(homeCards), switcher.join(", "));
  check("no “Hidden from Home” section", (await page.getByText("Hidden from Home").count()) === 0);
  await page.goto(`${BASE}/settings?section=dashboard`);
  await page.getByLabel("Show Recovery Plans on my dashboard").click();
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/`);
  await page.getByText("Choose a focus area").waitFor();
  check("re-enabled feature returns", (await page.locator("article.pal-card h3").allInnerTexts()).includes("Recovery Plans"));

  // Privacy mode via the keyboard shortcut: no real amounts in the page text.
  await page.goto(`${BASE}/dashboard?account=${ACCOUNT}`);
  await page.getByText("Typical monthly surplus").waitFor();
  await page.keyboard.press("Alt+Shift+KeyH");
  await page.waitForTimeout(1200);
  const txt = await page.locator("main").innerText();
  check("privacy mode hides every dollar amount", !/\$\s?\d/.test(txt) && txt.includes("••••"));
  await page.keyboard.press("Alt+Shift+KeyH");
  await page.waitForTimeout(800);

  // Real report downloads through the UI.
  for (const fmt of ["PDF", "Excel"]) {
    await page.getByRole("button", { name: "Download Report" }).first().click();
    if (fmt === "Excel") await page.getByRole("radio", { name: /Excel/ }).click();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: `Download ${fmt}` }).click()]);
    const path = await dl.path();
    const head = fs.readFileSync(path).subarray(0, 4).toString("latin1");
    const name = dl.suggestedFilename();
    check(`${fmt} report downloads a real file`, fmt === "PDF" ? head === "%PDF" : head.startsWith("PK"), name);
    check(`${fmt} file name reflects the context`, name.startsWith(`ClementIQ_Financial_Report_${ACCOUNT}_`), name);
    await page.keyboard.press("Escape");
  }

  // Judge Demo order and judge report.
  await page.goto(`${BASE}/judge?account=${ACCOUNT}`);
  await page.getByText("Key takeaways").waitFor({ timeout: 60000 });
  const order = await page.locator("section[id]").evaluateAll((els) => els.map((e) => e.id));
  check("Judge Demo steps are in order", JSON.stringify(order) === JSON.stringify(["step-1", "step-2", "step-3", "step-4", "final"]), order.join(" → "));
  const [jdl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }),
    (async () => { await page.locator("#final").getByRole("button", { name: "Download Report" }).click(); await page.getByRole("button", { name: "Download PDF" }).click(); })()]);
  check("judge report downloads", jdl.suggestedFilename() === `ClementIQ_Judge_Demo_${ACCOUNT}.pdf`, jdl.suggestedFilename());
  await ctx.close();
}

// ── Customer: no judge tools, direct URL and API blocked ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await login(ctx, { role: "customer", account: ACCOUNT });
  check("customer sees no judge toolbar or Judge Demo card",
    (await page.getByRole("region", { name: "Judge tools" }).count()) === 0 && (await page.locator("article.pal-card h3", { hasText: "Judge Demo" }).count()) === 0);
  await page.goto(`${BASE}/judge`);
  const blocked = await page.getByText("Judge Demo is only available to judges").waitFor({ timeout: 30000 }).then(() => true, () => false);
  check("customer is blocked from /judge", blocked);
  const r = await api(page, "POST", "/reports/export", { report: "judge", format: "pdf", account_id: ACCOUNT });
  check("customer cannot export judge reports (403)", r.status === 403, String(r.status));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
