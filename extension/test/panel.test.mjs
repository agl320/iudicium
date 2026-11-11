// The real content script (panel + storage) on a fixture page, with
// chrome.* stubbed: click "Fill this page", read the panel, remember answers.
//   SCREENSHOT=1 npm test   saves test/panel.png

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const CHROME_STUB = `
  window.__store = {};
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.filter((k) => k in __store).map((k) => [k, structuredClone(__store[k])])),
        set: async (obj) => { Object.assign(__store, structuredClone(obj)); __listeners.forEach((f) => f()); },
      },
      onChanged: { addListener: (f) => __listeners.push(f) },
    },
    runtime: { sendMessage: async () => {}, onMessage: { addListener: () => {} } },
  };
  window.__listeners = [];
`;

test("panel: fill, review, remember", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e));
    await page.setContent(`<!doctype html><html><head></head><body>${read("./fixtures/workday/application-questions.html")}</body></html>`);
    await page.addScriptTag({ content: read("./mocks.js") });
    await page.addScriptTag({ content: CHROME_STUB });
    await page.addScriptTag({ content: read("../dist/content.js") });

    const panel = page.locator("iudicium-autofill");
    await panel.getByText("iudicium · Fill").click();
    await panel.getByRole("button", { name: "Fill this page" }).click();
    await panel.getByText(/filled · \d+ need you/).waitFor({ timeout: 20000 });
    const summary = await panel.locator(".summary").textContent();
    assert.match(summary, /^1[0-9] filled · [3-5] need you · 0 failed/);
    assert.equal(await page.$eval("#q1", (e) => e.dataset.iud === undefined), true); // highlight is on the container
    assert.equal(await page.$eval('[data-automation-id="formField-q1"]', (e) => e.dataset.iud), "filled");
    assert.equal(await page.$eval('[data-automation-id="formField-q9"]', (e) => e.dataset.iud), "needs");

    if (process.env.SCREENSHOT) await page.screenshot({ path: new URL("./panel.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") });

    // Log tab streams entries; Verbose adds the per-field detail.
    await panel.getByRole("button", { name: /^Log/ }).click();
    await panel.locator("ol.log li", { hasText: "Fill finished" }).waitFor();
    assert.equal(await panel.locator("ol.log li", { hasText: "resolver screening" }).count(), 0);
    await panel.getByText("Verbose").click();
    assert.ok((await panel.locator("ol.log li", { hasText: "resolver screening" }).count()) > 0);
    if (process.env.SCREENSHOT) await page.screenshot({ path: new URL("./panel-log.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") });
    await panel.getByRole("button", { name: /^Results/ }).click();

    await page.fill("#q9", "Because of the robots.");
    await panel.getByText("Remember my answers").click();
    await panel.getByText(/Saved 1 answer/).waitFor();
    const saved = await page.evaluate(() => window.__store.saved);
    assert.equal(Object.values(saved)[0][0].fingerprint, "why do you want to work at {company}");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
