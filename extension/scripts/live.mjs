// Fills real, live application forms with the sample profile and reports
// what worked. Read-only toward the employer: it never clicks Submit and the
// browser is thrown away afterwards.
//
//   node build.mjs && node scripts/live.mjs                 (default URLs below)
//   node scripts/live.mjs https://jobs.lever.co/x/y/apply   (any URL)
//   HEADED=1 node scripts/live.mjs ...                      (watch it)
//
// Job links expire; the defaults are looked up from each board's public API.

import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const HARNESS = readFileSync(new URL("../test/.build/harness.js", import.meta.url), "utf8");

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function defaults() {
  const out = {};
  const tries = {
    greenhouse: async () => `https://job-boards.greenhouse.io/gitlab/jobs/${(await json("https://boards-api.greenhouse.io/v1/boards/gitlab/jobs")).jobs[0].id}`,
    ashby: async () => (await json("https://api.ashbyhq.com/posting-api/job-board/ramp")).jobs[0].applyUrl,
    lever: async () => (await json("https://api.lever.co/v0/postings/palantir?limit=1&mode=json"))[0].applyUrl,
  };
  for (const [k, f] of Object.entries(tries)) {
    try {
      out[k] = await f();
    } catch (e) {
      console.log(`(no ${k} URL: ${e.message})`);
    }
  }
  return out;
}

// A one-page PDF, to check that resume upload fields accept a file.
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
).toString("base64");

const args = process.argv.slice(2);
const targets = args.length ? Object.fromEntries(args.map((u, i) => [`url${i + 1}`, u])) : await defaults();

const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 1000 } });
let failures = 0;
for (const [name, url] of Object.entries(targets)) {
  const page = await context.newPage();
  // Never let a submit through, whatever happens.
  await page.route("**/*", (route) => {
    const req = route.request();
    if (req.method() === "POST" && /apply|application|submit|candidates/i.test(req.url()) && !/graphql|api\/non-user|locations|autocomplete|parse|upload|s3|presign/i.test(req.url())) {
      console.log(`   (blocked POST ${req.url().slice(0, 90)})`);
      return route.abort();
    }
    return route.continue();
  });
  console.log(`\n== ${name}: ${url}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.addScriptTag({ content: HARNESS });
    if (process.env.DEBUG) {
      await page.evaluate(() => window.__iud.setDebug(true));
      page.on("console", (m) => console.log("   ", m.text().replace(/%c/g, "")));
    }
    const detected = await page.evaluate(() => window.__iud.detect());
    if (!detected) {
      console.log("   no application form detected");
      failures++;
      continue;
    }
    const r = await page.evaluate(
      async ([pdf]) => {
        const p = window.__iud.sampleProfile();
        p.resumeFile = { name: "Alex_Morgan_Resume.pdf", type: "application/pdf", data: pdf };
        return window.__iud.fill(p);
      },
      [PDF],
    );
    console.log(`   adapter: ${r.adapter} · company: ${r.company || "(unknown)"} · ${r.items.length} fields`);
    const counts = {};
    for (const i of r.items) {
      counts[i.status] = (counts[i.status] ?? 0) + 1;
      const mark = { filled: "✔", kept: "·", needs: "?", failed: "✘" }[i.status];
      console.log(`   ${mark} ${i.question.slice(0, 70).padEnd(70)} ${i.kind.padEnd(8)} ${(i.detail ?? "").slice(0, 70)}${i.source ? ` [${i.source}]` : ""}`);
    }
    console.log(`   → ${JSON.stringify(counts)}`);
    failures += counts.failed ?? 0;
    if (process.env.SHOT) await page.screenshot({ path: `live-${name}.png`, fullPage: true });
  } catch (e) {
    console.log(`   ERROR ${e.message}`);
    failures++;
  } finally {
    await page.close();
  }
}
await browser.close();
process.exitCode = failures ? 1 : 0;
