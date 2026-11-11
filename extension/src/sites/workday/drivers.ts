// Workday-only widgets: the search "prompt" (multiSelectContainer) and the
// month/day/year date spinners.

import type { AnswerValue, FieldDriver } from "../../core/types";
import { matchOption, norm } from "../../core/match";
import { focusIn, focusOut, isVisible, pressKey, realClick, setNativeValue, sleep, text, typeChars, waitFor } from "../../dom/events";
import { logger } from "../../debug/log";

const log = logger("prompt");
const dlog = logger("date");

// --- Prompt: type to search, click a result, it becomes a "pill" ----------------------

const container = (el: Element) => el.querySelector('[data-automation-id="multiSelectContainer"]') ?? el;
const searchInput = (el: Element) => container(el).querySelector<HTMLInputElement>("input");
const pills = (el: Element) => [...container(el).querySelectorAll('[data-automation-id="selectedItem"]')];
const pillText = (p: Element) =>
  p.querySelector("[data-automation-label]")?.getAttribute("data-automation-label") ||
  (p.getAttribute("aria-label") ?? text(p)).replace(/,\s*press delete.*$/i, "");

/** Visible search results (not the selected pills, which reuse the same id). */
const results = (doc: Document) =>
  [...doc.querySelectorAll('[data-automation-id="promptOption"], [data-automation-id="promptLeafNode"], [role="option"]')]
    .filter(isVisible)
    .filter((o) => !o.closest('[data-automation-id="selectedItemList"]'));

const resultText = (o: Element) => o.getAttribute("data-automation-label") || text(o);

/** "Job Board > LinkedIn" → ["Job Board", "LinkedIn"]; search for the leaf. */
const path = (want: string) => want.split(">").map((s) => s.trim()).filter(Boolean);

async function pick(el: Element, want: string): Promise<string | null> {
  const input = searchInput(el)!;
  const doc = el.ownerDocument;
  const steps = path(want);
  const leaf = steps[steps.length - 1];
  focusIn(input);
  // Search by the leaf ("Canada (+1)" → "Canada").
  setNativeValue(input, leaf.replace(/\s*\(.*?\)\s*/g, " ").trim() || leaf);
  pressKey(input, "Enter");
  log.debug(`search “${input.value}”`, { want });
  const picked = () => pills(el).map(pillText).find((p) => norm(p).includes(norm(leaf)) || norm(leaf).includes(norm(p)));
  // Results can be the leaf itself or a category ("Job Board") that opens more.
  for (let depth = 0; depth < 3 && !picked(); depth++) {
    const opts = (await waitFor(() => (results(doc).length ? results(doc) : null), 3000)) ?? [];
    const texts = opts.map(resultText);
    let i = matchOption(texts, [leaf]);
    if (i < 0 && steps.length > 1) i = matchOption(texts, steps.slice(0, -1));
    log.debug(`results (${texts.length})`, texts.slice(0, 15));
    if (i < 0) {
      log.debug(`no result matches “${leaf}”`);
      break;
    }
    log.debug(`click “${texts[i]}”`);
    realClick(opts[i]);
    await sleep(300);
  }
  const done = picked();
  if (!done) {
    setNativeValue(input, "");
    pressKey(input, "Escape");
  }
  focusOut(input);
  return done ?? null;
}

export const promptDriver: FieldDriver = {
  name: "workday-prompt",
  detect: (el) => !!el.querySelector('[data-automation-id="multiSelectContainer"]'),
  kind: () => "search",
  read(el) {
    const p = pills(el).map(pillText);
    return p.length ? (p.length === 1 ? p[0] : p) : null;
  },
  async write(el, answer) {
    if (!searchInput(el)) return { ok: false, note: "no search box" };
    const asList = (v: AnswerValue) => (Array.isArray(v) ? v : [typeof v === "boolean" ? (v ? "Yes" : "No") : v]);
    const current = pills(el).map(pillText);
    // Several values: all of them are wanted. One value: candidates are fallbacks.
    if (Array.isArray(answer.value)) {
      for (const w of answer.value) {
        if (current.some((c) => norm(c).includes(norm(path(w).pop()!)))) continue;
        if (!(await pick(el, w))) return { ok: false, note: `no result for “${w}”` };
      }
      return { ok: true, shown: pills(el).map(pillText).join(", ") };
    }
    const tries = [...asList(answer.value), ...(answer.candidates ?? [])];
    if (current.length && tries.some((w) => current.some((c) => norm(c).includes(norm(path(w).pop()!)))))
      return { ok: true, shown: current.join(", "), note: "already set" };
    // Single choice: clear what's there (Workday's country default, a parser guess).
    for (const pill of pills(el)) {
      const del = pill.querySelector('[data-automation-id="DELETE_charm"]');
      if (del) {
        realClick(del);
        await sleep(150);
      }
    }
    for (const w of tries) {
      const p = await pick(el, w);
      if (p) return { ok: true, shown: p };
    }
    log.warn("no search result matched any wanted value", { tried: tries });
    return { ok: false, note: `no result for ${tries.map((t) => `“${t}”`).join(", ")}` };
  },
};

// --- Date: separate spinbutton inputs for month / day / year ---------------------------

type Part = "Month" | "Day" | "Year";
const PARTS: Part[] = ["Month", "Day", "Year"];

const partInput = (el: Element, part: Part) =>
  el.querySelector<HTMLInputElement>(`[data-automation-id="dateSection${part}-input"], input[data-automation-id="dateSection${part}"]`);

export const dateDriver: FieldDriver = {
  name: "workday-date",
  detect: (el) => !!el.querySelector('[data-automation-id^="dateSection"]'),
  kind: () => "date",
  read(el) {
    const v = Object.fromEntries(PARTS.map((p) => [p, partInput(el, p)?.value ?? ""]));
    if (!v.Year && !v.Month) return null;
    return [v.Year, v.Month && v.Month.padStart(2, "0"), v.Day && v.Day.padStart(2, "0")].filter(Boolean).join("-");
  },
  async write(el, answer) {
    const m = String(answer.value).match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
    if (!m) {
      dlog.warn("not a date", answer.value);
      return { ok: false, note: `not a date: ${answer.value}` };
    }
    const want: Record<Part, string | undefined> = { Year: m[1], Month: m[2] && String(+m[2]), Day: m[3] && String(+m[3]) };
    if (partInput(el, "Month") && !want.Month) return { ok: false, note: "needs a month" };
    if (partInput(el, "Day") && !want.Day) want.Day = "1";
    for (const part of PARTS) {
      const input = partInput(el, part);
      const value = want[part];
      if (!input || !value) continue;
      if (Number(input.value) === Number(value)) continue;
      const display = input.parentElement?.querySelector('[data-automation-id$="-display"]');
      if (display) realClick(display);
      await typeChars(input, value);
      await sleep(80);
      focusOut(input);
    }
    const shown = dateDriver.read(el) as string | null;
    const ok = PARTS.every((p) => !partInput(el, p) || !want[p] || Number(partInput(el, p)!.value) === Number(want[p]));
    const parts = Object.fromEntries(PARTS.filter((p) => partInput(el, p)).map((p) => [p, { want: want[p], got: partInput(el, p)!.value }]));
    if (ok) dlog.debug("typed", parts);
    else dlog.warn("date parts did not take", parts);
    return { ok, shown: shown ?? "" };
  },
};
