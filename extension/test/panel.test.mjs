// The real content script (panel + storage + learning) on fixture pages, with
// chrome.* stubbed: fill, answer by hand, click Workday's Next, then see the
// answers come back at another employer.
//   SCREENSHOT=1 npm test   saves test/panel*.png

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const shot = (page, name) =>
  process.env.SCREENSHOT ? page.screenshot({ path: new URL(`./${name}.png`, import.meta.url).pathname.replace(/^\/(\w:)/, "$1") }) : null;

const chromeStub = (store) => `
  window.__store = ${JSON.stringify(store)};
  window.__listeners = [];
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.filter((k) => k in __store).map((k) => [k, structuredClone(__store[k])])),
        set: async (obj) => { Object.assign(__store, structuredClone(obj)); __listeners.forEach((f) => f()); },
        remove: async (k) => { delete __store[k]; },
      },
      onChanged: { addListener: (f) => __listeners.push(f) },
    },
    runtime: { sendMessage: async () => {}, onMessage: { addListener: () => {} } },
  };
`;

async function openPanelPage(browser, html, store = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e));
  await page.setContent(`<!doctype html><html><head></head><body>${html}</body></html>`);
  await page.addScriptTag({ content: read("./mocks.js") });
  await page.addScriptTag({ content: chromeStub(store) });
  await page.addScriptTag({ content: read("../dist/content.js") });
  const panel = page.locator("iudicium-autofill");
  await panel.getByText("iudicium · Fill").click();
  return { page, panel };
}

async function fillAndWait(panel) {
  await panel.getByRole("button", { name: "Fill this page" }).click();
  await panel.getByText(/filled · \d+ need you/).waitFor({ timeout: 30000 });
  return panel.locator(".summary").textContent();
}

const choose = async (page, button, option) => {
  await page.click(button);
  await page.click(`.mock-listbox [role="option"]:text("${option}")`);
};

test("panel: fill, answer, Next learns, answers come back elsewhere", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    // --- Acme: fill, then answer what it couldn't ---------------------------------
    const fixture = read("./fixtures/workday/application-questions.html");
    const { page, panel } = await openPanelPage(browser, fixture);
    const summary = await fillAndWait(panel);
    assert.match(summary, /^1[0-9] filled · [3-5] need you/);
    assert.equal(await page.$eval('[data-automation-id="formField-q1"]', (e) => e.dataset.iud), "filled");
    assert.equal(await page.$eval('[data-automation-id="formField-q9"]', (e) => e.dataset.iud), "needs");
    await shot(page, "panel");

    await page.fill("#q9", "Acme Corp builds the robots I grew up wanting to program.");
    await choose(page, "#q15", "3rd year");
    await choose(page, "#q13", "Yes");
    // Workday's own Next button: learning happens automatically.
    await page.click('[data-automation-id="pageFooterNextButton"]');
    await panel.getByText(/^Learned:/).waitFor();
    const store = await page.evaluate(() => window.__store);
    const memory = Object.values(store.memory)[0];
    assert.equal(memory.concepts.length, 3, JSON.stringify(memory.concepts.map((c) => c.variants[0].text)));
    assert.equal(memory.skills.kubernetes, true);
    assert.deepEqual(page.errors, []);

    // Log tab shows what was learned.
    await panel.getByRole("button", { name: /^Log/ }).click();
    await panel.locator("ol.log li", { hasText: "Learned from" }).waitFor();
    await shot(page, "panel-log");

    // --- Globex: reworded questions, same memory -------------------------------------
    const globex = fixture
      .replaceAll("Acme Corp", "Globex")
      .replace("Which of the following best describes your current year of study?", "What year of study are you currently in?")
      .replace("Do you have experience with Kubernetes?", "Are you proficient in Kubernetes?")
      .replace("Why do you want to work at Globex?", "What interests you about Globex?");
    const second = await openPanelPage(browser, globex, store);
    await fillAndWait(second.panel);
    assert.equal(await second.page.$eval("#q15", (e) => e.textContent.trim()), "3rd year");
    assert.equal(await second.page.$eval("#q13", (e) => e.textContent.trim()), "Yes");
    // A looser match is offered, not filled: one click applies it.
    assert.equal(await second.page.$eval("#q9", (e) => e.value), "");
    await second.panel.getByRole("button", { name: "Apply suggestion" }).first().click();
    await second.page.waitForFunction(() => document.querySelector("#q9").value.includes("Globex builds"));
    await second.panel.getByText(/accepted suggestion/).waitFor();
    assert.equal(await second.page.$eval('[data-automation-id="formField-q9"]', (e) => e.dataset.iud), "filled-medium");
    await shot(second.page, "panel-suggestion");
    assert.deepEqual(second.page.errors, []);
  } finally {
    await browser.close();
  }
});
