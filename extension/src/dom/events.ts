// Making scripted input look like a person's to React-based forms.

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function waitFor<T>(fn: () => T | null | undefined | false, timeout = 3000, step = 80): Promise<T | null> {
  const end = Date.now() + timeout;
  for (;;) {
    const r = fn();
    if (r) return r;
    if (Date.now() >= end) return null;
    await sleep(step);
  }
}

export const isVisible = (el: Element | null | undefined): el is Element => !!el && el.getClientRects().length > 0;

export const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** React ignores `el.value = x` (it tracks the value it last set), so use the
 *  prototype's setter and announce the change. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// Workday commits a field on blur. Chrome skips native focus/blur while the
// window isn't focused, so dispatch them explicitly as well.
export function focusIn(el: Element) {
  try {
    (el as HTMLElement).focus({ preventScroll: true });
  } catch {
    /* not focusable */
  }
  el.dispatchEvent(new FocusEvent("focus"));
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

export function focusOut(el: Element) {
  el.dispatchEvent(new FocusEvent("blur"));
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  try {
    (el as HTMLElement).blur();
  } catch {
    /* ignore */
  }
}

export async function commitText(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  focusIn(el);
  setNativeValue(el, value);
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Unidentified", bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { key: "Unidentified", bubbles: true }));
  await sleep(30);
  focusOut(el);
}

/** One key at a time, for widgets that listen to key presses (date spinners). */
export async function typeChars(el: HTMLInputElement, value: string) {
  focusIn(el);
  setNativeValue(el, "");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  for (const ch of value) {
    const init: KeyboardEventInit = { key: ch, code: /\d/.test(ch) ? `Digit${ch}` : undefined, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", init));
    el.dispatchEvent(new KeyboardEvent("keypress", init));
    setter.call(el, el.value + ch);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
    el.dispatchEvent(new KeyboardEvent("keyup", init));
    await sleep(20);
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function realClick(el: Element) {
  const init = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent("pointerdown", init));
  el.dispatchEvent(new MouseEvent("mousedown", init));
  el.dispatchEvent(new PointerEvent("pointerup", init));
  el.dispatchEvent(new MouseEvent("mouseup", init));
  (el as HTMLElement).click();
}

export function pressKey(el: Element, key: string) {
  const init = { key, code: key, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
}

export function labelOf(input: Element): string {
  const id = input.id;
  const byFor = id ? input.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  return text(byFor ?? input.closest("label")) || (input as HTMLInputElement).value || "";
}
