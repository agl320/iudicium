# iudicium autofill (prototype)

Chrome extension that fills job applications from a profile, one page at a
time: Workday, Greenhouse, Ashby and Lever out of the box, and any other site's
form when you click the toolbar button. You review every page and click
Next/Submit yourself. Flow diagrams: [../docs/autofill-flow.md](../docs/autofill-flow.md).

## Try it

```sh
npm install
npm run build        # → dist/
npm test             # builds, then runs the Playwright tests in headless Chrome
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`.
On a Workday / Greenhouse / Ashby / Lever application an **iudicium · Fill**
button appears bottom-right. Anywhere else, click the toolbar icon: it injects
the generic form scanner into that tab only (activeTab), never in the background.

Profiles come from the iudicium site: **Applications → Send to extension**
builds one from a resume (jobs with dates, schools, skills, contact details)
plus the facts a resume doesn't hold, and sends the resume as .docx to attach.
They can also be edited (and a resume file picked) in the options page.

## Sites

| Site | Detected by | Notes |
|---|---|---|
| Workday | `applyFlow*Page` / `formField-*` | multi-step; repeating Experience/Education; date spinners; search prompts |
| Greenhouse | `form#application-form` (job-boards) / `#application_form` (legacy) | React Select dropdowns (combobox driver); intl phone; runs inside embed iframes too |
| Ashby | `.ashby-application-form-container` | Yes/No toggle buttons; location combobox; SMS/WhatsApp consent left to you |
| Lever | `form#application-form li.application-question` | location box with Lever's own result list; card radios/checkboxes/selects |
| Anything else | name + email (or a resume upload) in the largest form | generic scanner: labels from `for=`, wrapping labels, ARIA, legends, `autocomplete` |

Every application it fills is recorded (`src/ext/track.ts`) and marked
submitted when you click the form's Submit; the site's Applications page reads
them through `src/ext/bridge.ts` (runs only on iudicium.netlify.app and localhost:5173).

## How it fits together

```
site adapter ──reads──> Question[] ──resolvers──> Answer ──driver writes──> page
```

- `src/sites/workday/` — finds `formField-*` containers, detects the step, fills
  repeating Experience/Education entries (clicks Add as needed).
- `src/sites/form.ts` — generic scanner (a field = the largest box around one
  control or radio/checkbox group); `greenhouse/`, `ashby/`, `lever/` and
  `generic/` are thin hint sets on top of it.
- `src/drivers/` — one per widget type: text, radio, checkbox(es), `<select>`,
  ARIA listbox dropdowns, ARIA comboboxes (React Select, location search),
  toggle buttons, file upload (attaches the profile's resume); Workday's search
  prompts and date spinners live with the adapter.
- `src/core/resolvers/` — answer questions, first match wins:
  `files` (resume / cover letter) → `guard` (legal/consent: never filled) →
  `profile` (contact details, location, current company/title) →
  `eeo` (deterministic, never learned or sent anywhere) → `memory` (what it
  learned from you) → `screening` (work authorization, sponsorship, previous
  employer, graduation timing, skills, education level...). An AI resolver
  slots in after these later.
- Fields nobody answers are marked yellow; near matches from memory are blue,
  with an "Apply suggestion" button.

Profile facts replace Workday's defaults (country, resume-parser guesses);
inferred answers don't overwrite existing values unless "Replace values already
on the page" is ticked.

## Learning

`src/core/learn/` — no model training: every answer you give is an example the
next question is compared against (nearest neighbour), so it learns from one
example, explains itself ("82% like …"), and stays in the browser.

- **When:** automatically when you click Workday's Next / Save and Continue
  (pages filled entirely by hand too), or with "Learn from this page".
  Profile, EEO and legal fields are never learned.
- **Matching:** synonyms folded (sponsorship/visa/H‑1B, authorized/eligible,
  want/interested…), light stemming, rare words weighted over common ones
  (TF‑IDF), character trigrams for word forms, and coverage of a short
  question inside a longer one (capped at "review").
- **Guards:** opposite wording ("require sponsorship" vs "work *without*
  sponsorship") flips a yes/no answer and marks it for review; questions that
  differ in names, numbers or dates (Docker/Kubernetes, 2027/2028, 25%/75%,
  Vancouver/Toronto) never match.
- **Memory:** one answer collects every wording it was given for; kept answers
  gain trust, changed ones lose it; an answer that differs at one employer
  becomes an override for that employer only; long answers store the employer
  as `{company}` and are always reviewed; yes/no skill questions teach skills
  ("Kubernetes: yes") used by the screening rules.
- **Confidence:** ≥ 86% similar fills, 70–86% fills dashed for review,
  50–70% is a suggestion, below that is ignored. Answers rules already got
  right aren't memorized, so they keep adapting to each employer and date.
- **Benchmark:** `test/paraphrase.test.mjs` (20 reworded pairs, 10 look‑alikes):
  currently 18 filled + 2 suggested, 0 missed, 0 look‑alikes filled.

The options page lists what each profile has learned (with every wording and
kept/changed counts) and lets you forget any of it.

## Debugging

The panel's **Log** tab streams what the autofill is doing while you use it.
By default it shows page changes, fill start/finish, and every field that needs
you, failed or was kept. Warnings show as a ⚠ count on the tab and on the
minimized button.

- **Verbose** adds every field found (kind, driver, Workday id, options read),
  which resolver answered what, and each dropdown/search/date step. It also
  prints to the page's DevTools console as `[iudicium:scope]` and is remembered
  for that site. To set it from the console instead:
  `localStorage.setItem("iudicium.debug", "1")`.
- **Copy** puts the whole log on the clipboard, plus the HTML of every field
  that failed or wasn't recognized. That's what's needed to fix a field on a
  real page. It contains the values that were filled in, so check it before
  sharing.
- Tests: `DEBUG=1 npm test` forwards verbose logs; `REPORT=1 npm test` prints
  each page's results.

Test fixtures: see `test/fixtures/workday/NOTICE.md` and `test/fixtures/NOTICE.md`.

- `npm test` — Workday + Greenhouse/Ashby/Lever/generic fixtures, learning, panel.
- `node test/site-bridge.e2e.mjs http://localhost:5173/` — with the site's dev
  server running: dashboard ↔ bridge ↔ extension storage, then fills Greenhouse
  with the profile the site produced.
- `node scripts/live.mjs [url...]` — fills **real, live** postings (defaults:
  one each from Greenhouse, Ashby, Lever via their public APIs) and prints what
  worked. It never clicks Submit and blocks application POSTs, but attaching
  the resume does upload a test PDF to that employer's form backend, so only
  run it when you're fine with that.
