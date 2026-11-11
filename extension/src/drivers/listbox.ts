// Custom dropdowns built on the ARIA listbox pattern: a button with
// aria-haspopup="listbox" opens role="option" items somewhere in the page
// (often a portal at the end of <body>). Workday, React Select-style widgets
// and many design systems share this shape.

import type { FieldDriver } from "../core/types";
import { isPlaceholder, norm } from "../core/match";
import { focusIn, focusOut, isVisible, pressKey, realClick, sleep, text, waitFor } from "../dom/events";
import { chooseIndex } from "./basic";
import { logger } from "../debug/log";

const log = logger("listbox");

const button = (el: Element) =>
  (el.matches('button[aria-haspopup="listbox"]') ? el : el.querySelector('button[aria-haspopup="listbox"]')) as HTMLElement;

/** The listbox this button opened: aria-controls/aria-owns if given, else the
 *  last visible one. */
function openList(btn: Element): Element | null {
  const doc = btn.ownerDocument;
  const ref = btn.getAttribute("aria-controls") || btn.getAttribute("aria-owns");
  const byRef = ref ? doc.getElementById(ref) : null;
  if (isVisible(byRef)) return byRef;
  const lists = [...doc.querySelectorAll('[role="listbox"]')].filter(isVisible);
  return lists.pop() ?? null;
}

const optionsIn = (list: Element) => [...list.querySelectorAll('[role="option"]')].filter(isVisible);

async function open(btn: HTMLElement): Promise<Element | null> {
  focusIn(btn);
  realClick(btn);
  return waitFor(() => {
    const list = openList(btn);
    return list && optionsIn(list).length ? list : null;
  }, 2500);
}

async function close(btn: HTMLElement) {
  pressKey(btn, "Escape");
  await sleep(60);
  if (openList(btn) && btn.getAttribute("aria-expanded") === "true") realClick(btn);
  focusOut(btn);
}

/** Long lists may render lazily: scroll until nothing new appears. */
async function allOptions(list: Element): Promise<Element[]> {
  const seen = new Map<string, Element>();
  for (let i = 0; i < 30; i++) {
    const before = seen.size;
    for (const o of optionsIn(list)) seen.set(text(o), o);
    if (list.scrollHeight <= list.clientHeight + 2 || (i > 0 && seen.size === before)) break;
    list.scrollTop += Math.max(list.clientHeight, 120);
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
    await sleep(100);
  }
  return [...seen.values()];
}

export const listboxDriver: FieldDriver = {
  name: "listbox",
  detect: (el) => !!button(el),
  kind: () => "choice",
  async options(el) {
    const btn = button(el);
    const list = await open(btn);
    if (!list) {
      log.warn("dropdown did not open while reading options", { button: text(btn) });
      return undefined;
    }
    const opts = (await allOptions(list)).map(text);
    await close(btn);
    return opts;
  },
  read(el) {
    const t = text(button(el));
    return t && !isPlaceholder(t) ? t : null;
  },
  async write(el, answer) {
    const btn = button(el);
    const list = await open(btn);
    if (!list) {
      log.warn("dropdown did not open", { button: text(btn) });
      return { ok: false, note: "dropdown did not open" };
    }
    const opts = optionsIn(list);
    let i = chooseIndex(opts.map(text), answer);
    let target: Element | undefined = opts[i];
    if (!target) {
      const all = await allOptions(list);
      i = chooseIndex(all.map(text), answer);
      target = all[i];
    }
    if (!target) {
      log.warn("no matching option", { wanted: [...(Array.isArray(answer.value) ? answer.value : [String(answer.value)]), ...(answer.candidates ?? [])], options: optionsIn(list).map(text) });
      await close(btn);
      return { ok: false, note: "no matching option" };
    }
    log.debug(`choose “${text(target)}”`, { from: opts.length, wanted: answer.value });
    const want = text(target);
    if (norm(text(btn)) === norm(want)) {
      await close(btn);
      return { ok: true, shown: want, note: "already set" };
    }
    target.scrollIntoView?.({ block: "nearest" });
    realClick(target);
    await waitFor(() => norm(text(button(el))).includes(norm(want)), 1500);
    focusOut(btn);
    const shown = text(button(el));
    const ok = norm(shown).includes(norm(want));
    if (!ok) log.warn("dropdown shows a different value after choosing", { chose: want, shown });
    return { ok, shown };
  },
};
