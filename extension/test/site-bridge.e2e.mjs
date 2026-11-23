// Site ↔ extension, end to end (needs the site's dev server: cd frontend && npx vite).
// Loads #/applications signed out with the real bridge.js and a chrome.storage
// stand-in, sends a resume to the "extension", changes a status, then fills the
// Greenhouse form with exactly the profile the site produced.
//   node build.mjs && node test/site-bridge.e2e.mjs [http://localhost:5173/]
// Not part of `npm test` (it needs the dev server).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const SITE = process.argv[2] ?? "http://localhost:5173/";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const BRIDGE = read("../dist/bridge.js");
const HARNESS = read("./.build/harness.js");
const MOCKS = read("./ats-mocks.js");

// chrome.* as the bridge sees it, backed by an object the test can inspect.
const CHROME = `(() => {
  const data = JSON.parse(sessionStorage.getItem("mockChrome") || "{}");
  const listeners = [];
  const save = () => sessionStorage.setItem("mockChrome", JSON.stringify(data));
  window.__chromeData = data;
  window.chrome = {
    runtime: { getManifest: () => ({ version: "0.2.0" }) },
    storage: {
      local: {
        async get(keys) { const out = {}; for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]); return out; },
        async set(obj) { const changes = {}; for (const [k, v] of Object.entries(obj)) { changes[k] = { newValue: v }; data[k] = structuredClone(v); } save(); listeners.forEach((l) => l(changes)); },
        async remove(k) { delete data[k]; save(); },
      },
      onChanged: { addListener: (l) => listeners.push(l) },
    },
  };
})();`;

const now = new Date().toISOString();
const SEEDED = {
  applications: [
    { id: "boards.greenhouse.io/acme/jobs/1", url: "https://boards.greenhouse.io/acme/jobs/1", company: "Acme", title: "Firmware Intern", site: "Greenhouse", profileId: "sample", profileLabel: "Tech intern (sample)", status: "submitted", startedAt: now, submittedAt: now, updatedAt: now, filled: 14, needs: 3 },
  ],
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Only the dev server: no Supabase or other network.
await page.route("**/*", (r) => (r.request().url().startsWith(SITE) ? r.continue() : r.abort()));
await page.addInitScript(({ chrome, seeded }) => {
  if (!sessionStorage.getItem("mockChrome")) sessionStorage.setItem("mockChrome", JSON.stringify(seeded));
  // Content scripts run before the page: the stand-in, then the bridge.
  new Function(chrome)();
}, { chrome: CHROME, seeded: SEEDED });
await page.addInitScript({ content: BRIDGE });

// A resume in this browser (signed-out builder storage): the builder's own sample.
await page.goto(`${SITE}#/`);
await page.evaluate(async () => {
  const { sampleResume } = await import("/src/resume/types.ts");
  localStorage.setItem("iudicium.resume.v1", JSON.stringify(sampleResume()));
});
await page.goto(`${SITE}#/applications`);
await page.waitForSelector('[data-testid="ext-status"]:has-text("connected")', { timeout: 15000 });
console.log("✔ dashboard sees the extension");

await page.waitForSelector('[data-testid="tracker"] >> text=Acme');
console.log("✔ application tracked by the extension shows in the tracker");

const row = page.locator('[data-testid="profile-row"]').first();
await row.getByRole("button", { name: "Details" }).click();
await row.getByText("HRIS Analyst II · Northwind Systems").waitFor();
await row.getByRole("button", { name: /Send to extension/ }).click();
await row.getByText(/Sent: 2 jobs, 1 school,/).waitFor({ timeout: 15000 });
const profiles = await page.evaluate(() => window.__chromeData.profiles);
const sent = profiles.find((p) => p.id === "site-local");
assert.ok(sent, "profile stored in the extension");
assert.equal(profiles.some((p) => p.id === "sample"), false, "sample profile replaced");
assert.equal(sent.person.firstName, "Alex");
assert.equal(sent.person.email, "alex@example.com");
assert.equal(sent.person.phone, "604 555 0123");
assert.deepEqual(sent.experience.map((e) => [e.company, e.start, e.end ?? null]), [
  ["Northwind Systems", "2024-05", null],
  ["Pacific Health Group", "2021-01", "2024-04"],
]);
assert.equal(sent.education[0].level, "bachelor");
assert.equal(sent.education[0].field, "Human Resource Management");
assert.ok(sent.skills.includes("Workday HCM"));
assert.match(sent.resumeFile.name, /\.docx$/);
assert.ok(sent.resumeFile.data.length > 4000, "docx attached");
console.log(`✔ resume sent: ${sent.experience.length} jobs, ${sent.education.length} school, ${sent.skills.length} skills, ${sent.resumeFile.name}`);

await page.getByLabel("Status for Acme").selectOption("interview");
await page.waitForFunction(() => window.__chromeData.applications[0].status === "interview");
console.log("✔ status change reaches the extension");
await page.screenshot({ path: new URL("../../../tmp/iud-snap/dashboard.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true });

// The profile the site built, used by the extension on a real Greenhouse form.
const form = await browser.newPage();
await form.setContent(`<html><head><title>Job Application for Payroll Analyst at GitLab</title></head><body>${read("./fixtures/greenhouse/application.html")}</body></html>`);
await form.addScriptTag({ content: MOCKS });
await form.addScriptTag({ content: HARNESS });
const r = await form.evaluate((p) => window.__iud.fill(p), sent);
const byQ = (re) => r.items.find((i) => re.test(i.question));
assert.equal(await form.$eval("#first_name", (e) => e.value), "Alex");
assert.equal(byQ(/^Resume/).status, "filled");
assert.equal(await form.$eval("#resume", (e) => e.files[0]?.name), sent.resumeFile.name);
assert.equal(r.items.filter((i) => i.status === "failed").length, 0);
console.log(`✔ site profile fills Greenhouse: ${r.items.filter((i) => i.status === "filled").length} filled, ${r.items.filter((i) => i.status === "needs").length} left for you`);

assert.deepEqual(errors, [], "no page errors");
await browser.close();
console.log("all good");
