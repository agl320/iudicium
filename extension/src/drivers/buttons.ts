// Choices drawn as toggle buttons (Ashby's Yes / No, segmented controls):
// several <button aria-pressed> side by side; the pressed one is the answer.

import type { FieldDriver } from "../core/types";
import { focusIn, focusOut, realClick, sleep, text } from "../dom/events";
import { chooseIndex } from "./basic";

const buttons = (el: Element) => [...el.querySelectorAll<HTMLElement>("button[aria-pressed]")];
const pressed = (b: Element) => b.getAttribute("aria-pressed") === "true" || /\b_?(active|selected)\b|_active_|_selected_/i.test(b.className);

export const buttonChoiceDriver: FieldDriver = {
  name: "buttons",
  detect: (el) => buttons(el).length >= 2,
  kind: () => "choice",
  options: async (el) => buttons(el).map(text),
  read(el) {
    const b = buttons(el).find(pressed);
    return b ? text(b) : null;
  },
  async write(el, answer) {
    const list = buttons(el);
    const i = chooseIndex(list.map(text), answer);
    if (i < 0) return { ok: false, note: "no matching option" };
    const target = list[i];
    if (pressed(target)) return { ok: true, shown: text(target), note: "already set" };
    focusIn(target);
    realClick(target);
    focusOut(target);
    await sleep(120);
    return { ok: pressed(target), shown: text(target) };
  },
};
