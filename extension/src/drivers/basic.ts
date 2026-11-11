// Drivers for native form controls. `el` is the field container (or the
// control itself for standalone checkboxes).

import type { Answer, AnswerValue, FieldDriver } from "../core/types";
import { isPlaceholder, matchOption, yesNoOption } from "../core/match";
import { commitText, focusIn, focusOut, labelOf, realClick, sleep } from "../dom/events";
import { logger } from "../debug/log";

const log = logger("driver");
const wantsOf = (a: Answer) => [...(Array.isArray(a.value) ? a.value : [String(a.value)]), ...(a.candidates ?? [])];

const own = <T extends Element>(el: Element, sel: string): T[] =>
  (el.matches(sel) ? [el] : [...el.querySelectorAll(sel)]) as T[];

/** The option an answer points at: Yes/No for booleans, else the first of
 *  value + candidates that the options contain. */
export function chooseIndex(options: string[], answer: Answer): number {
  const real = options.map((o, i) => [o, i] as const).filter(([o]) => !isPlaceholder(o));
  const texts = real.map(([o]) => o);
  let k: number;
  if (typeof answer.value === "boolean") k = yesNoOption(texts, answer.value);
  else {
    const wants = [...(Array.isArray(answer.value) ? answer.value : [answer.value]), ...(answer.candidates ?? [])];
    k = matchOption(texts, wants);
    if (k < 0 && wants.some((w) => /^(yes|no)$/i.test(w))) k = yesNoOption(texts, /^yes$/i.test(wants[0]));
  }
  return k < 0 ? -1 : real[k][1];
}

export function asBool(v: AnswerValue): boolean {
  return typeof v === "boolean" ? v : /^(yes|true|1|y)$/i.test(String(Array.isArray(v) ? v[0] : v));
}

export function asText(v: AnswerValue): string {
  return typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : v;
}

const isChecked = (el: Element) => (el as HTMLInputElement).checked || el.getAttribute("aria-checked") === "true";

// --- text / textarea ------------------------------------------------------------

const TEXT_SEL =
  'textarea, input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=number], input[type=url], input[type=search]';

function textInput(el: Element) {
  return own<HTMLInputElement | HTMLTextAreaElement>(el, TEXT_SEL)[0];
}

export const textDriver: FieldDriver = {
  name: "text",
  detect: (el) => !!textInput(el),
  kind: (el) => (textInput(el) instanceof HTMLTextAreaElement ? "longtext" : "text"),
  read: (el) => textInput(el)?.value || null,
  async write(el, answer) {
    const input = textInput(el);
    const value = asText(answer.value);
    if (input.value === value) return { ok: true, shown: value, note: "already set" };
    await commitText(input, value);
    await sleep(50);
    if (input.value !== value) log.warn("text did not stick (page rewrote it?)", { wanted: value, got: input.value });
    return { ok: input.value === value, shown: input.value };
  },
};

// --- radio group --------------------------------------------------------------------

const radios = (el: Element) => own<HTMLInputElement>(el, "input[type=radio]");

export const radioDriver: FieldDriver = {
  name: "radio",
  detect: (el) => radios(el).length > 0,
  kind: () => "choice",
  options: async (el) => radios(el).map(labelOf),
  read(el) {
    const r = radios(el).find(isChecked);
    return r ? labelOf(r) : null;
  },
  async write(el, answer) {
    const list = radios(el);
    const i = chooseIndex(list.map(labelOf), answer);
    if (i < 0) {
      log.warn("radio: no matching option", { wanted: wantsOf(answer), options: list.map(labelOf) });
      return { ok: false, note: "no matching option" };
    }
    const target = list[i];
    if (isChecked(target)) return { ok: true, shown: labelOf(target), note: "already set" };
    focusIn(target);
    realClick(target);
    focusOut(target);
    await sleep(120);
    return { ok: isChecked(target), shown: labelOf(target) };
  },
};

// --- checkboxes ---------------------------------------------------------------------

const boxes = (el: Element) => own<HTMLInputElement>(el, "input[type=checkbox]");

export const checkboxDriver: FieldDriver = {
  name: "checkbox",
  detect: (el) => boxes(el).length === 1,
  kind: () => "yesno",
  read: (el) => isChecked(boxes(el)[0]),
  async write(el, answer) {
    const box = boxes(el)[0];
    const want = asBool(answer.value);
    if (isChecked(box) === want) return { ok: true, shown: want ? "checked" : "unchecked", note: "already set" };
    focusIn(box);
    realClick(box);
    focusOut(box);
    await sleep(150);
    return { ok: isChecked(box) === want, shown: want ? "checked" : "unchecked" };
  },
};

export const checkboxGroupDriver: FieldDriver = {
  name: "checkboxGroup",
  detect: (el) => boxes(el).length > 1,
  kind: () => "multi",
  options: async (el) => boxes(el).map(labelOf),
  read(el) {
    const on = boxes(el).filter(isChecked).map(labelOf);
    return on.length ? on : null;
  },
  async write(el, answer) {
    const list = boxes(el);
    const labels = list.map(labelOf);
    const wants = Array.isArray(answer.value) ? answer.value : [answer.value];
    const picked = new Set<number>();
    for (const w of wants) {
      const i = chooseIndex(labels, { ...answer, value: typeof w === "boolean" ? w : String(w), candidates: [] });
      if (i >= 0) picked.add(i);
    }
    if (!picked.size) {
      log.warn("checkboxes: no matching option", { wanted: wantsOf(answer), options: labels });
      return { ok: false, note: "no matching option" };
    }
    for (const [i, box] of list.entries()) {
      if (isChecked(box) !== picked.has(i)) {
        realClick(box);
        await sleep(100);
      }
    }
    const ok = list.every((b, i) => isChecked(b) === picked.has(i));
    return { ok, shown: [...picked].map((i) => labels[i]).join(", ") };
  },
};

// --- <select> ----------------------------------------------------------------------

const select = (el: Element) => own<HTMLSelectElement>(el, "select")[0];

export const selectDriver: FieldDriver = {
  name: "select",
  detect: (el) => !!select(el),
  kind: (el) => (select(el).multiple ? "multi" : "choice"),
  options: async (el) => [...select(el).options].map((o) => o.text),
  read(el) {
    const s = select(el);
    const o = s.options[s.selectedIndex];
    return o && !isPlaceholder(o.text) ? o.text : null;
  },
  async write(el, answer) {
    const s = select(el);
    const i = chooseIndex([...s.options].map((o) => o.text), answer);
    if (i < 0) {
      log.warn("select: no matching option", { wanted: wantsOf(answer), options: [...s.options].map((o) => o.text) });
      return { ok: false, note: "no matching option" };
    }
    if (s.selectedIndex === i) return { ok: true, shown: s.options[i].text, note: "already set" };
    focusIn(s);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(s, s.options[i].value);
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
    focusOut(s);
    return { ok: s.selectedIndex === i, shown: s.options[i].text };
  },
};

// --- files -------------------------------------------------------------------------

export const fileDriver: FieldDriver = {
  name: "file",
  detect: (el) => own(el, 'input[type=file], [data-automation-id="file-upload-drop-zone"]').length > 0,
  kind: () => "file",
  read: () => null,
  write: async () => ({ ok: false, note: "attach by hand" }),
};
