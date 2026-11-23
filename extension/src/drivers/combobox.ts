// ARIA comboboxes: an <input role="combobox"> that opens role="option" items,
// either a fixed list (React Select on Greenhouse, most design systems) or
// results for what you type (location pickers on Ashby, Greenhouse, Lever).
// Opens the list first; if nothing matches, types each wanted value and
// picks from the results.

import type { Answer, AnswerValue, FieldDriver } from "../core/types";
import { matchOption, norm } from "../core/match";
import { focusIn, focusOut, isVisible, pressKey, realClick, setNativeValue, sleep, text, waitFor } from "../dom/events";
import { chooseIndex } from "./basic";
import { logger } from "../debug/log";

const log = logger("combobox");

// Search boxes inside other widgets (intl-tel-input's country list) aren't the field.
const NOT_FIELD = ".iti__search-input, .iti__country-list *, [aria-label='Search']";
const inputOf = (el: Element) => {
  const all: Element[] = [...(el.matches('[role="combobox"]') ? [el] : []), ...el.querySelectorAll('input[role="combobox"], [role="combobox"] input, [role="combobox"]')];
  // React Select's input can be 0px wide until focused, so it counts as visible.
  return (all.find((c) => !c.matches(NOT_FIELD) && (c.matches("input.select__input") || isVisible(c))) ?? null) as HTMLInputElement | null;
};

/** Selected value as the widget shows it (React Select keeps it outside the input). */
function shown(el: Element): string[] {
  const multi = [...el.querySelectorAll('[class*="multi-value__label"], [class*="multiValue"] [class*="label"]')].map(text).filter(Boolean);
  if (multi.length) return multi;
  const single = el.querySelector('[class*="single-value"], [class*="singleValue"]');
  if (single && text(single)) return [text(single)];
  const input = inputOf(el);
  if (input && "value" in input && input.value && input.ownerDocument.activeElement !== input) return [input.value];
  return [];
}

/** The listbox this combobox controls, else the closest visible one. */
function listFor(el: Element, input: Element): Element | null {
  const doc = input.ownerDocument;
  const ref = input.getAttribute("aria-controls") || input.getAttribute("aria-owns");
  const byRef = ref ? doc.getElementById(ref) : null;
  if (isVisible(byRef)) return byRef;
  const inside = [...el.querySelectorAll('[role="listbox"], [class*="menu-list"], [class*="MenuList"]')].filter(isVisible);
  if (inside.length) return inside[0];
  // Portaled menus: the last visible listbox in the page.
  return [...doc.querySelectorAll('[role="listbox"]')].filter(isVisible).pop() ?? null;
}

const optionsIn = (list: Element | null) => (list ? [...list.querySelectorAll('[role="option"]')].filter(isVisible) : []);
const LOADING = /^(loading|searching|no (options|results)|type to search|start typing)/i;

async function waitOptions(el: Element, input: Element, timeout: number): Promise<Element[]> {
  let last = -1;
  let stable = 0;
  // Wait for a list that stops changing (async results arrive in bursts).
  const got = await waitFor(
    () => {
      const opts = optionsIn(listFor(el, input)).filter((o) => !LOADING.test(text(o)));
      if (opts.length && opts.length === last) stable++;
      else stable = 0;
      last = opts.length;
      return opts.length && stable >= 2 ? opts : null;
    },
    timeout,
    100,
  );
  return got ?? optionsIn(listFor(el, input)).filter((o) => !LOADING.test(text(o)));
}

async function openList(el: Element, input: HTMLInputElement, timeout = 1500): Promise<Element[]> {
  focusIn(input);
  realClick(input);
  let opts = await waitOptions(el, input, Math.min(timeout, 700));
  if (!opts.length) {
    pressKey(input, "ArrowDown");
    opts = await waitOptions(el, input, timeout);
  }
  return opts;
}

async function close(input: HTMLInputElement) {
  pressKey(input, "Escape");
  await sleep(50);
  focusOut(input);
}

const asList = (v: AnswerValue): string[] => (Array.isArray(v) ? v : [typeof v === "boolean" ? (v ? "Yes" : "No") : v]);

/** Type a query and pick the best result for `wants`. */
async function search(el: Element, input: HTMLInputElement, query: string, wants: string[], answer: Answer): Promise<string | null> {
  focusIn(input);
  realClick(input);
  setNativeValue(input, query);
  const opts = await waitOptions(el, input, 3500);
  const texts = opts.map(text);
  log.debug(`search “${query}” → ${texts.length} result(s)`, texts.slice(0, 10));
  let i = chooseIndex(texts, { ...answer, value: wants[0], candidates: wants.slice(1) });
  // Location-style results ("Vancouver, BC, Canada") for a query typed from the first part.
  if (i < 0) i = texts.findIndex((t) => norm(t).startsWith(norm(query)));
  if (i < 0) i = matchOption(texts, [query]);
  if (i < 0) return null;
  const want = texts[i];
  opts[i].scrollIntoView?.({ block: "nearest" });
  realClick(opts[i]);
  await waitFor(() => shown(el).some((s) => norm(s).includes(norm(want)) || norm(want).includes(norm(s))), 1500);
  return want;
}

async function pickOne(el: Element, input: HTMLInputElement, answer: Answer): Promise<string | null> {
  const wants = [...asList(answer.value), ...(answer.candidates ?? [])].filter(Boolean);
  // 1. Fixed list: open it and choose.
  const opts = await openList(el, input);
  if (opts.length) {
    const texts = opts.map(text);
    const i = chooseIndex(texts, answer);
    if (i >= 0) {
      const want = texts[i];
      if (shown(el).some((s) => norm(s) === norm(want))) {
        await close(input);
        return want;
      }
      opts[i].scrollIntoView?.({ block: "nearest" });
      realClick(opts[i]);
      await waitFor(() => shown(el).some((s) => norm(s) === norm(want) || norm(s).includes(norm(want))), 1500);
      return want;
    }
  }
  // 2. Type to filter / search: each wanted value, then its first part ("Vancouver" of "Vancouver, BC").
  const queries = [...new Set(wants.flatMap((w) => [w.replace(/\s*\(.*?\)\s*/g, " ").trim(), w.split(",")[0].trim()]))].slice(0, 4);
  for (const q of queries) {
    if (!q) continue;
    const got = await search(el, input, q, wants, answer);
    if (got) return got;
  }
  setNativeValue(input, "");
  await close(input);
  return null;
}

export const comboboxDriver: FieldDriver = {
  name: "combobox",
  detect: (el) => !!inputOf(el),
  kind: () => "choice",
  async options(el) {
    const input = inputOf(el);
    if (!input) return undefined;
    const opts = await openList(el, input, 900);
    const texts = opts.map(text);
    await close(input);
    return texts.length ? texts : undefined;
  },
  read(el) {
    const s = shown(el);
    return s.length ? (s.length === 1 ? s[0] : s) : null;
  },
  async write(el, answer) {
    const input = inputOf(el);
    if (!input) return { ok: false, note: "no combobox input" };
    if (Array.isArray(answer.value) && answer.value.length > 1) {
      const got: string[] = [];
      for (const v of answer.value) {
        const p = await pickOne(el, input, { ...answer, value: v, candidates: [] });
        if (!p) return { ok: false, note: `no option for “${v}”` };
        got.push(p);
      }
      await close(input);
      return { ok: true, shown: got.join(", ") };
    }
    const picked = await pickOne(el, input, answer);
    focusOut(input);
    if (!picked) {
      log.warn("no option matched", { wanted: [...asList(answer.value), ...(answer.candidates ?? [])] });
      return { ok: false, note: "no matching option" };
    }
    await sleep(100);
    const now = shown(el);
    const ok = now.some((s) => norm(s).includes(norm(picked)) || norm(picked).includes(norm(s)));
    if (!ok) log.warn("combobox shows a different value after choosing", { chose: picked, shown: now });
    return { ok, shown: now.join(", ") || picked };
  },
};
