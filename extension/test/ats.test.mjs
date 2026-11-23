// Greenhouse, Ashby, Lever and a plain HTML form: real forms saved from live
// postings (scripts removed, see fixtures/NOTICE.md), widgets mocked by
// ats-mocks.js, filled with the sample profile in headless Chrome.
//   REPORT=1 npm test   prints each fill report

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const HARNESS = read("./.build/harness.js");
const MOCKS = read("./ats-mocks.js");
const TODAY = "2026-11-10T12:00:00";
const PDF = Buffer.from("%PDF-1.1\n%%EOF").toString("base64");

let browser;
before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => browser?.close());

async function open(fixture, { title = "", url } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e));
  await page.route("**/*", (r) => (url && r.request().url() === url ? r.fulfill({ body: "<!doctype html><html><head></head><body></body></html>", contentType: "text/html" }) : r.abort()));
  if (url) await page.goto(url);
  const html = read(`./fixtures/${fixture}`);
  await page.setContent(`<!doctype html><html><head><title>${title}</title></head><body>${html}</body></html>`);
  await page.addScriptTag({ content: MOCKS });
  if (process.env.DEBUG) {
    await page.evaluate(() => localStorage.setItem("iudicium.debug", "1")).catch(() => {});
    page.on("console", (m) => console.log("   ", m.text().replace(/%c/g, "")));
  }
  await page.addScriptTag({ content: HARNESS });
  page.errors = errors;
  return page;
}

async function fill(page, opts = {}) {
  const result = await page.evaluate(
    async ([o, today, pdf]) => {
      const profile = window.__iud.sampleProfile();
      if (!o.noResume) profile.resumeFile = { name: "Alex_Morgan_Resume.pdf", type: "application/pdf", data: pdf };
      return window.__iud.fill(profile, { today, ...o });
    },
    [opts, TODAY, PDF],
  );
  if (process.env.REPORT) {
    console.log(`\n== ${result.adapter} · ${result.page} (company: ${result.company})`);
    for (const i of result.items) console.log(`  [${i.status}] ${i.question.slice(0, 90)} (${i.kind}) → ${i.detail ?? ""}${i.source ? ` (${i.source})` : ""}`);
  }
  return result;
}

const item = (result, re) => {
  const found = result.items.find((i) => re.test(i.question));
  assert.ok(found, `no report item matching ${re}; have: ${result.items.map((i) => i.question).join(" | ")}`);
  return found;
};
const value = (page, sel) => page.$eval(sel, (e) => e.value);
const count = (r, status) => r.items.filter((i) => i.status === status).length;

test("Greenhouse (real form, job-boards.greenhouse.io)", async () => {
  const page = await open("greenhouse/application.html", { title: "Job Application for AI Transformation Owner, CRO at GitLab" });
  const r = await fill(page);
  assert.equal(r.adapter, "Greenhouse");
  assert.equal(r.company, "GitLab");
  assert.equal(count(r, "failed"), 0, "no field failed");
  assert.equal(await value(page, "#first_name"), "Alex");
  assert.equal(await value(page, "#last_name"), "Morgan");
  assert.equal(await value(page, "#email"), "alex@example.com");
  assert.equal(await value(page, "#phone"), "604 555 0123");
  assert.equal(await value(page, "#question_37369956002"), "https://www.linkedin.com/in/alexmorgan");
  assert.equal(await page.$eval("#resume", (e) => e.files[0]?.name), "Alex_Morgan_Resume.pdf");
  // React Select dropdowns
  const shownIn = (id) => page.$eval(`#${id}`, (e) => e.closest(".select-shell").querySelector(".select__single-value")?.textContent ?? "");
  assert.equal(await shownIn("question_37369958002"), "Canada", "country question from profile");
  assert.match(await shownIn("gender"), /decline/i, "EEO: decline");
  assert.match(await shownIn("veteran_status"), /don't wish/i);
  assert.equal(item(r, /^Resume/).status, "filled");
});

test("Ashby (real form, jobs.ashbyhq.com)", async () => {
  const page = await open("ashby/application.html", { title: "Software Engineer, Security, Cloud @ Ramp" });
  const r = await fill(page);
  assert.equal(r.adapter, "Ashby");
  assert.equal(r.company, "Ramp");
  assert.equal(count(r, "failed"), 0, "no field failed");
  assert.equal(await value(page, "#_systemfield_name"), "Alex Morgan");
  assert.equal(await value(page, "#_systemfield_email"), "alex@example.com");
  assert.equal(await value(page, '[name="4b71793a-c95c-4cc9-9d06-02e6ef7c5777"]'), "604 555 0123");
  assert.equal(await value(page, ".ashby-application-form-input-autocomplete"), "Vancouver, British Columbia, Canada");
  assert.equal(await page.$eval("#_systemfield_resume", (e) => e.files[0]?.name), "Alex_Morgan_Resume.pdf");
  // SMS / WhatsApp consent: never answered.
  assert.equal(await page.$$eval('input[name="smsConsent"]:checked, input[name="whatsAppConsent"]:checked', (x) => x.length), 0);
  assert.equal(item(r, /sms/i).status, "needs");
  // "7 years building software": the sample profile has ~1 year, the skill rules don't claim it.
  assert.equal(item(r, /7 years/).status, "needs");
});

test("Lever (real form, jobs.lever.co)", async () => {
  const page = await open("lever/application.html", { title: "Palantir Technologies - Administrative Business Partner" });
  const r = await fill(page);
  assert.equal(r.adapter, "Lever");
  assert.match(r.company, /Palantir/);
  assert.equal(count(r, "failed"), 0, "no field failed");
  assert.equal(await value(page, 'input[name="name"]'), "Alex Morgan");
  assert.equal(await value(page, 'input[name="email"]'), "alex@example.com");
  assert.equal(await value(page, 'input[name="org"]'), "Pacific Robotics Club");
  assert.equal(await value(page, 'input[name="urls[GitHub]"]'), "https://github.com/alexmorgan");
  assert.equal(await value(page, "input[name=location]"), "Vancouver, British Columbia, Canada");
  assert.notEqual(await value(page, "#selected-location"), "");
  // Work authorization (radio cards): authorized in Canada, would need sponsorship in the US.
  assert.equal(item(r, /legally authorized/).status, "filled");
  assert.equal(await page.$eval('input[type=file][name=resume]', (e) => e.files[0]?.name), "Alex_Morgan_Resume.pdf");
});

test("Generic form: plain HTML on an unknown careers site", async () => {
  const page = await open("generic/application.html", { title: "Apply: Firmware Intern | Acme Robotics" });
  const r = await fill(page);
  assert.equal(r.adapter, "Generic form");
  assert.equal(count(r, "failed"), 0, "no field failed");
  assert.equal(await value(page, "#fname"), "Alex");
  assert.equal(await value(page, "#lname"), "Morgan");
  assert.equal(await value(page, "#mail"), "alex@example.com");
  assert.equal(await value(page, "#city"), "Vancouver");
  assert.equal(await value(page, "#country"), "CA");
  assert.equal(await page.$eval('input[name="auth"]:checked', (e) => e.value), "yes");
  assert.equal(await page.$eval('input[name="sponsor"]:checked', (e) => e.value), "no");
  assert.equal(item(r, /cover letter/i).status, "needs");
  // Newsletter consent is left alone.
  assert.equal(await page.$eval("#news", (e) => e.checked), false);
});

test("Generic form: a login form is not an application", async () => {
  const page = await browser.newPage();
  await page.setContent(`<form><label>Email <input type=email name=email></label><label>Password <input type=password name=pw></label><button>Sign in</button></form>`);
  await page.addScriptTag({ content: HARNESS });
  assert.equal(await page.evaluate(() => window.__iud.detect()), null);
});
