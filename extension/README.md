# iudicium autofill (prototype)

Chrome extension that fills Workday applications (any employer) from a profile,
one page at a time. You review every page and click Next/Submit yourself.

## Try it

```sh
npm install
npm run build        # → dist/
npm test             # builds, then runs the Playwright tests in headless Chrome
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`.
Click the toolbar icon (or the gear in the panel) to edit profiles. On a Workday
application, an **iudicium · Fill** button appears bottom-right.

## How it fits together

```
site adapter ──reads──> Question[] ──resolvers──> Answer ──driver writes──> page
```

- `src/sites/workday/` — finds `formField-*` containers, detects the step, fills
  repeating Experience/Education entries (clicks Add as needed).
- `src/drivers/` — one per widget type: text, radio, checkbox(es), `<select>`,
  ARIA listbox dropdowns; Workday's search prompts and date spinners live with
  the adapter.
- `src/core/resolvers/` — answer questions, first match wins:
  `guard` (legal/consent: never filled) → `profile` (contact details) →
  `eeo` (deterministic, never saved or sent anywhere) → `saved` (your past
  answers) → `screening` (work authorization, sponsorship, previous employer,
  graduation timing, skills, education level...). An AI resolver slots in
  after these later.
- Fields nobody answers are marked yellow. "Remember my answers" saves what you
  typed into them (employer names become `{company}`) for next time.

Profile facts replace Workday's defaults (country, resume-parser guesses);
inferred answers don't overwrite existing values unless "Replace values already
on the page" is ticked.

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

Test fixtures: see `test/fixtures/workday/NOTICE.md`.
