// Fills Workday pages (real snapshots + synthetic steps) in headless Chrome
// with the sample profile, then checks what ended up on the page.
//   npm test            (builds first)
//   REPORT=1 npm test   (also prints each fill report)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const HARNESS = read("../dist/harness.js");
const MOCKS = read("./mocks.js");
const TODAY = "2026-11-10T12:00:00";

let browser;
before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => browser?.close());

async function open(fixture, { transform, afterMocks } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e));
  let html = read(`./fixtures/workday/${fixture}`);
  if (transform) html = transform(html);
  if (!html.includes('data-automation-id="applyFlowPage"')) html = `<div data-automation-id="applyFlowPage">${html}</div>`;
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await page.addScriptTag({ content: MOCKS });
  if (afterMocks) await page.evaluate(afterMocks);
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
    ([o, today]) => window.__iud.fill(o.profile ?? window.__iud.sampleProfile(), { today, ...o }),
    [opts, TODAY],
  );
  if (process.env.REPORT) {
    console.log(`\n== ${result.page} (company: ${result.company})`);
    for (const i of result.items) console.log(`  [${i.status}] ${i.question} → ${i.detail ?? ""}${i.source ? ` (${i.source}${i.confidence ? "/" + i.confidence : ""})` : ""}`);
  }
  return result;
}

const item = (result, re) => {
  const found = result.items.find((i) => re.test(i.question));
  assert.ok(found, `no report item matching ${re}`);
  return found;
};
const value = (page, sel) => page.$eval(sel, (e) => e.value);
const shown = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const checked = (page, sel) => page.$eval(sel, (e) => e.checked);
const pills = (page, sel) => page.$$eval(`${sel} [data-automation-id="selectedItem"]`, (els) => els.map((e) => e.getAttribute("aria-label")));

test("My Information (real snapshot)", async () => {
  const page = await open("my-information.html");
  const r = await fill(page);
  assert.equal(r.page, "My Information");
  assert.equal(r.company, "Acme Corp");
  assert.equal(await value(page, '[data-automation-id="formField-legalName--firstName"] input'), "Alex");
  assert.equal(await value(page, '[data-automation-id="formField-legalName--lastName"] input'), "Morgan");
  assert.equal(await value(page, '[data-automation-id="formField-addressLine1"] input'), "123 Example St");
  assert.equal(await value(page, '[data-automation-id="formField-city"] input'), "Vancouver");
  assert.equal(await value(page, '[data-automation-id="formField-postalCode"] input'), "V6B 1A1");
  assert.equal(await value(page, '[data-automation-id="formField-phoneNumber"] input'), "604 555 0123");
  assert.equal(await shown(page, '[data-automation-id="formField-country"] button'), "Canada");
  assert.equal(await shown(page, '[data-automation-id="formField-countryRegion"] button'), "British Columbia");
  assert.equal(await shown(page, '[data-automation-id="formField-phoneType"] button'), "Mobile");
  assert.deepEqual(await pills(page, '[data-automation-id="formField-countryPhoneCode"]'), ["Canada (+1)"]);
  // Not in the profile's experience → "No".
  assert.equal(await page.$eval('[data-automation-id="formField-candidateIsPreviousWorker"] input[value="false"]', (e) => e.checked), true);
  // SMS / WhatsApp opt-ins are consent: left alone.
  assert.equal(item(r, /SMS|text/i).status, "needs");
  assert.equal(await checked(page, '[data-automation-id="phone-sms-opt-in"]'), false);
  assert.equal(r.items.filter((i) => i.status === "failed").length, 0, JSON.stringify(r.items.filter((i) => i.status === "failed")));
  assert.deepEqual(page.errors, []);
});

test("My Experience (real snapshot): fills existing entries, flags extras", async () => {
  const page = await open("my-experience.html");
  const r = await fill(page);
  assert.equal(r.page, "My Experience");
  const panel = (name, n) => `[aria-labelledby="${name}-${n}-panel"]`;
  const exp1 = panel("Professional-Experience", 1);
  assert.equal(await value(page, `${exp1} [data-automation-id="formField-jobTitle"] input`), "Software Engineering Intern");
  assert.equal(await value(page, `${exp1} [data-automation-id="formField-companyName"] input`), "Northwind Systems");
  assert.equal(await value(page, `${exp1} [data-automation-id="formField-startDate"] [data-automation-id="dateSectionMonth-input"]`), "5");
  assert.equal(await value(page, `${exp1} [data-automation-id="formField-endDate"] [data-automation-id="dateSectionYear-input"]`), "2025");
  const exp2 = panel("Professional-Experience", 2);
  assert.equal(await checked(page, `${exp2} [data-automation-id="formField-currentlyWorkHere"] input`), true);
  assert.equal(await value(page, `${exp2} [data-automation-id="formField-roleDescription"] textarea`), "Lead a team of 6 writing C++ motor control firmware.");
  const edu1 = panel("Education", 1);
  assert.equal(await value(page, `${edu1} [data-automation-id="formField-schoolName"] input`), "University of British Columbia");
  assert.equal(await shown(page, `${edu1} [data-automation-id="formField-degree"] button`), "Bachelor's Degree");
  assert.deepEqual(await pills(page, `${edu1} [data-automation-id="formField-fieldOfStudy"]`), ["Computer Engineering"]);
  assert.equal(await value(page, '[data-automation-id="formField-linkedInAccount"] input'), "https://www.linkedin.com/in/alexmorgan");
  // The snapshot has 3 experience and 2 education entries; the profile has 2 and 1.
  assert.equal(r.items.filter((i) => /extra entry/.test(i.question)).length, 2);
  assert.ok(r.items.some((i) => /Languages/.test(i.question) && i.status === "needs"));
  assert.equal(r.items.filter((i) => i.status === "failed").length, 0, JSON.stringify(r.items.filter((i) => i.status === "failed")));
  assert.deepEqual(page.errors, []);
});

test("My Experience: clicks Add when there are no entries yet", async () => {
  const page = await open("my-experience.html", {
    // The mocks have captured each section's first entry as the template; now empty the sections.
    afterMocks: () => document.querySelectorAll('[role="group"][aria-labelledby$="-panel"]').forEach((p) => p.remove()),
  });
  const r = await fill(page);
  const count = (name) => page.$$eval(`[aria-labelledby="${name}-section"] [role="group"][aria-labelledby$="-panel"]`, (e) => e.length);
  assert.equal(await count("Professional-Experience"), 2);
  assert.equal(await count("Education"), 1);
  assert.equal(r.items.filter((i) => i.status === "failed").length, 0, JSON.stringify(r.items.filter((i) => i.status === "failed")));
});

test("Application Questions (synthetic): reasons from profile facts", async () => {
  const page = await open("application-questions.html");
  const r = await fill(page);
  assert.equal(r.page, "Application Questions");
  assert.equal(await shown(page, "#q1"), "Yes"); // authorized in Canada
  assert.equal(await shown(page, "#q2"), "Yes"); // needs sponsorship for the US
  assert.equal(await checked(page, "#q3y"), true); // 18+
  assert.equal(await shown(page, "#q4"), "Yes"); // Python is in skills
  assert.equal(await checked(page, "#q5y"), true); // graduating May 2027
  assert.equal(await shown(page, "#q6"), "No"); // never worked at Acme
  assert.equal(await shown(page, "#q7"), "No");
  assert.equal(await value(page, "#q8"), "2 weeks");
  assert.deepEqual(await pills(page, '[data-automation-id="formField-source"]'), ["Company Website"]);
  assert.equal(await value(page, '[data-automation-id="formField-q12"] [data-automation-id="dateSectionMonth-input"]'), "5");
  assert.equal(await value(page, '[data-automation-id="formField-q12"] [data-automation-id="dateSectionYear-input"]'), "2027");
  assert.equal(await shown(page, "#q14"), "Bachelor's Degree");
  // Left for you: long answer, legal attestation, unknown skill, unknown question.
  assert.equal(item(r, /Why do you want/).status, "needs");
  assert.equal(item(r, /I certify/).status, "needs");
  assert.equal(await checked(page, "#q10"), false);
  assert.equal(item(r, /Kubernetes/).status, "needs");
  assert.equal(item(r, /year of study/).status, "needs");
});

test("Voluntary Disclosures (synthetic): EEO declines, consent left alone", async () => {
  const page = await open("voluntary-disclosures.html");
  const r = await fill(page);
  assert.equal(await shown(page, "#personalInfoUS--ethnicity"), "I do not wish to answer.");
  assert.equal(await shown(page, "#personalInfoUS--gender"), "I do not wish to answer.");
  assert.equal(await shown(page, "#personalInfoUS--hispanicOrLatino"), "I do not wish to answer.");
  assert.equal(await shown(page, "#personalInfoUS--veteranStatus"), "I do not wish to self-identify");
  assert.equal(item(r, /Privacy Policy/).status, "needs");
});

test("Voluntary Disclosures with stated answers", async () => {
  const page = await open("voluntary-disclosures.html");
  const profile = await page.evaluate(() => {
    const p = window.__iud.sampleProfile();
    p.eeo = { gender: "male", hispanicLatino: "no", race: "Asian", veteran: "not", disability: "no" };
    return p;
  });
  await fill(page, { profile });
  assert.equal(await shown(page, "#personalInfoUS--ethnicity"), "Asian (United States of America)");
  assert.equal(await shown(page, "#personalInfoUS--gender"), "Male");
  assert.equal(await shown(page, "#personalInfoUS--hispanicOrLatino"), "No");
  assert.equal(await shown(page, "#personalInfoUS--veteranStatus"), "I am not a protected veteran");
});

test("Self Identify (synthetic): name, today's date, disability form", async () => {
  const page = await open("self-identify.html");
  await fill(page);
  assert.equal(await value(page, "#selfIdentifiedDisabilityData--name"), "Alex Morgan");
  const part = (p) => value(page, `[data-automation-id="formField-dateSignedOn"] [data-automation-id="dateSection${p}-input"]`);
  assert.deepEqual([await part("Month"), await part("Day"), await part("Year")], ["11", "10", "2026"]);
  assert.deepEqual([await checked(page, "#d1"), await checked(page, "#d2"), await checked(page, "#d3")], [false, false, true]);
});

test("Remember my answers: what you type is reused, for any employer", async () => {
  const page = await open("application-questions.html");
  await fill(page);
  // You answer the ones it couldn't.
  await page.fill("#q9", "Acme builds the robots I grew up wanting to program.");
  await page.click("#q15");
  await page.click('.mock-listbox [role="option"]:text("3rd year")');
  const saved = await page.evaluate(() => window.__iud.remember());
  const why = saved.find((s) => /why do you want/.test(s.fingerprint));
  assert.ok(why, JSON.stringify(saved));
  assert.equal(why.fingerprint, "why do you want to work at {company}");
  assert.ok(saved.some((s) => s.value === "3rd year"));
  // Only what you typed: answers the rules worked out stay live (they depend on the employer/date).
  assert.equal(saved.length, 2, JSON.stringify(saved.map((s) => s.question)));

  // Another employer asks the same things.
  const other = await open("application-questions.html", { transform: (html) => html.replaceAll("Acme Corp", "Globex") });
  const r = await fill(other, { saved });
  assert.equal(r.company, "Globex");
  assert.equal(await value(other, "#q9"), "Acme builds the robots I grew up wanting to program.");
  assert.equal(item(r, /Why do you want/).source, "saved");
  assert.equal(await shown(other, "#q15"), "3rd year");
});

test("debug log explains a failure", async () => {
  // The form offers no option matching the profile's education level.
  const page = await open("application-questions.html", {
    transform: (html) => html.replace("High School|Bachelor's Degree|Master's Degree|Doctorate", "High School|Doctorate"),
  });
  const r = await fill(page);
  assert.equal(item(r, /highest level/).status, "failed");
  const log = await page.evaluate(() => window.__iud.log());
  assert.match(log, /Fill started: Workday · Application Questions/);
  assert.match(log, /resolver screening: \d+\/\d+/);
  assert.match(log, /WARN  \[listbox\] no matching option .*"options":\["High School","Doctorate"\]/);
  assert.ok(log.includes("--- field markup (failed / unrecognized) ---\n# FAILED What is your highest level"));
  assert.match(log, /Fill finished in \d+ ms .*"failed":1/);
});
