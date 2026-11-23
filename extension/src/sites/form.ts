// Generic form scanning: turns any page's form controls into Fields, for sites
// without dedicated code and as the base of the Greenhouse / Ashby / Lever
// adapters (which only add hints: where fields live, what ids mean, the
// employer's name).
//
// A field is the largest ancestor of a control (or of a radio/checkbox group)
// that contains no other field's controls. That box normally also holds the
// question's label, so the same box works for reading the question, choosing
// a driver, and highlighting it in the page.

import type { SiteAdapter } from "../core/engine";
import type { CanonicalKey, Field, FieldDriver, Question } from "../core/types";
import { keyFromLabel } from "../core/resolvers/profile";
import { isVisible, labelOf, text } from "../dom/events";
import { GENERIC_DRIVERS, driverFor } from "../drivers";
import { buttonChoiceDriver } from "../drivers/buttons";
import { comboboxDriver } from "../drivers/combobox";
import { logger, snapshot } from "../debug/log";

const log = logger("form");

/** Generic drivers plus the custom widgets most ATS forms share. */
export const FORM_DRIVERS: FieldDriver[] = [buttonChoiceDriver, comboboxDriver, ...GENERIC_DRIVERS];

const CONTROL =
  'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select, [role="combobox"], button[aria-haspopup="listbox"], button[aria-pressed]';

/** Hidden inputs that still count: styled radios/checkboxes and file pickers
 *  are often visually hidden behind a label or a button. */
const countsHidden = (c: Element) => c.matches("input[type=radio], input[type=checkbox], input[type=file]");

/** Group key: radios and same-named checkboxes form one question; buttons with
 *  aria-pressed (Yes/No) group by their parent. */
function groupOf(c: Element): string {
  const input = c as HTMLInputElement;
  if (c.matches("input[type=radio]") && input.name) return `radio:${input.form?.id ?? ""}:${input.name}`;
  if (c.matches("input[type=checkbox]") && input.name) {
    const same = c.ownerDocument.querySelectorAll(`input[type=checkbox][name="${CSS.escape(input.name)}"]`);
    if (same.length > 1) return `checkbox:${input.name}`;
  }
  if (c.matches("button[aria-pressed]") && c.parentElement) return `pressed:${uid(c.parentElement)}`;
  return `one:${uid(c)}`;
}

let nextUid = 1;
const uids = new WeakMap<Element, string>();
function uid(el: Element) {
  if (!uids.has(el)) uids.set(el, String(nextUid++));
  return uids.get(el)!;
}

export type FormHints = {
  /** Field containers, if the site marks them (fallback: discovered). */
  containers?: (root: Element) => Element[];
  /** Root of the application form. */
  root?: (doc: Document) => Element | null;
  /** Site ids/names → canonical keys. */
  keyFor?: (control: Element, container: Element) => CanonicalKey | undefined;
  questionText?: (container: Element) => string | undefined;
  /** Controls to leave out entirely (search boxes, captcha...). */
  ignore?: (control: Element) => boolean;
  drivers?: FieldDriver[];
};

const IGNORE =
  '[name^="g-recaptcha"], [name^="h-captcha"], [id^="g-recaptcha"], .iti__search-input, [aria-label="Search"], iudicium-autofill *';

function controlsIn(root: Element, hints: FormHints): Element[] {
  const found = [...(root.matches(CONTROL) ? [root] : []), ...root.querySelectorAll(CONTROL)];
  return found.filter((c) => {
    if (c.matches(IGNORE) || hints.ignore?.(c)) return false;
    if ((c as HTMLInputElement).disabled) return false;
    if (isVisible(c)) return true;
    return countsHidden(c) && isVisible((c as Element).closest("label, div, li, fieldset"));
  });
}

/** One container per question: climb from the group's controls while the
 *  ancestor holds no other group's controls. */
function discover(root: Element, controls: Element[], all: Element[]): Element[] {
  const groups = new Map<string, Element[]>();
  for (const c of controls) {
    const g = groupOf(c);
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  // Every control on the page stops the climb, not only the ones being placed.
  const groupOfEl = new Map(all.map((c) => [c, groupOf(c)]));
  const out: Element[] = [];
  for (const [g, members] of groups) {
    let box: Element = members.length > 1 ? commonAncestor(members) : members[0];
    for (let up = box.parentElement, depth = 0; up && up !== root && depth < 6; up = up.parentElement, depth++) {
      if (up.matches("form, body")) break;
      const inside = [...up.querySelectorAll(CONTROL)].filter((c) => groupOfEl.has(c));
      if (inside.some((c) => groupOfEl.get(c) !== g)) break;
      box = up;
    }
    out.push(box);
  }
  return out;
}

function commonAncestor(els: Element[]): Element {
  let a: Element | null = els[0];
  while (a && !els.every((e) => a!.contains(e))) a = a.parentElement;
  return a ?? els[0];
}

const clean = (s: string) =>
  s
    .replace(/[*∗✱]/g, "")
    .replace(/\s*\(?\brequired\b\)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

function byIds(doc: Document, ids: string | null): string {
  return (ids ?? "")
    .split(/\s+/)
    .map((id) => text(id ? doc.getElementById(id) : null))
    .filter(Boolean)
    .join(" ");
}

/** The question a container asks: legend, label for its control, ARIA
 *  label, or the container's own text without its options. */
export function questionOf(container: Element, control: Element): string {
  const doc = container.ownerDocument;
  const legend = container.querySelector("legend") ?? (container.matches("fieldset") ? null : container.closest("fieldset")?.querySelector(":scope > legend"));
  const single = control.matches("input[type=checkbox]") && controlsIn(container, {}).filter((c) => c.matches("input[type=checkbox]")).length === 1;
  const group = !single && control.matches("input[type=radio], input[type=checkbox], button[aria-pressed]");
  // A labelled group box (Greenhouse uploads, radio groups) names the question.
  const labelled = container.getAttribute("aria-labelledby") || container.querySelector("[role=radiogroup][aria-labelledby], [role=group][aria-labelledby]")?.getAttribute("aria-labelledby");
  if (labelled && byIds(doc, labelled)) return clean(byIds(doc, labelled));
  if (group && legend && text(legend)) return clean(text(legend));
  if (single) {
    const own = labelOf(control);
    if (own) return clean(own);
  }
  const id = control.id;
  const forLabel = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  // A label wrapping the input often also wraps help text: take its first block.
  if (forLabel && text(forLabel) && !group) return clean(text(forLabel));
  const ariaBy = byIds(doc, control.getAttribute("aria-labelledby"));
  if (ariaBy && !group) return clean(ariaBy);
  if (legend && text(legend)) return clean(text(legend));
  const aria = control.getAttribute("aria-label");
  if (aria && !group && !/^(search|select|type here)/i.test(aria)) return clean(aria);
  // Container text minus the options' own labels and any typed value.
  const copy = container.cloneNode(true) as Element;
  copy.querySelectorAll("option, [role=option], [role=listbox], label:has(input[type=radio]), label:has(input[type=checkbox]), button, script, style").forEach((x) => x.remove());
  const own = clean(text(copy));
  if (own) return own.length > 300 ? own.slice(0, 300) : own;
  return clean((control as HTMLInputElement).placeholder || control.getAttribute("name") || "");
}

/** HTML autocomplete tokens → canonical keys. */
const AUTOCOMPLETE: Record<string, CanonicalKey> = {
  "given-name": "firstName",
  "additional-name": "middleName",
  "family-name": "lastName",
  name: "fullName",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "address-line1": "addressLine1",
  "street-address": "addressLine1",
  "address-line2": "addressLine2",
  "address-level2": "city",
  "address-level1": "region",
  "postal-code": "postalCode",
  "country-name": "country",
  country: "country",
  organization: "currentCompany",
  "organization-title": "currentTitle",
};

function keyOf(control: Element): CanonicalKey | undefined {
  const ac = (control.getAttribute("autocomplete") ?? "").split(/\s+/).pop() ?? "";
  return AUTOCOMPLETE[ac];
}

function isRequired(container: Element, control: Element): boolean {
  if ((control as HTMLInputElement).required || control.getAttribute("aria-required") === "true") return true;
  if (container.querySelector('[aria-required="true"], [required]')) return true;
  // "Name *" / "Name ✱" style markers.
  return /[*✱]\s*$/.test(text(container.querySelector("label, legend, [class*=label], [class*=title]")));
}

let nextId = 1;
const qids = new WeakMap<Element, string>();
const qid = (el: Element) => {
  if (!qids.has(el)) qids.set(el, `f${nextId++}`);
  return qids.get(el)!;
};

/** The control a container is about (for labels, keys, required). */
function primaryControl(container: Element, hints: FormHints): Element | null {
  return controlsIn(container, hints)[0] ?? (container.matches(CONTROL) ? container : null);
}

/** Fields for one form root, in page order. */
export async function scanForm(root: Element, hints: FormHints = {}, skip?: Set<Element>, readOptions = true): Promise<Field[]> {
  const drivers = hints.drivers ?? FORM_DRIVERS;
  const controls = controlsIn(root, hints);
  let boxes = hints.containers ? hints.containers(root).filter((b) => isVisible(b) || controlsIn(b, hints).length) : [];
  // Controls the site's containers missed are picked up generically.
  const covered = new Set(boxes.flatMap((b) => controlsIn(b, hints)));
  const stray = controls.filter((c) => !covered.has(c));
  if (stray.length) boxes = [...boxes, ...discover(root, stray, controls)];
  // Page order, outermost first; drop boxes nested in another box.
  boxes = [...new Set(boxes)]
    .filter((b) => !boxes.some((o) => o !== b && o.contains(b)))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const out: Field[] = [];
  for (const box of boxes) {
    if (skip?.has(box)) continue;
    const control = primaryControl(box, hints);
    if (!control) continue;
    const driver = driverFor(box, drivers);
    const textQ = hints.questionText?.(box) || questionOf(box, control);
    if (!driver) {
      log.warn(`no driver for field “${textQ}”`);
      snapshot(`NO DRIVER ${textQ}`, box);
      continue;
    }
    const kind = driver.kind(box);
    const question: Question = {
      id: qid(box),
      text: textQ,
      kind,
      required: isRequired(box, control),
      key: hints.keyFor?.(control, box) ?? keyOf(control),
    };
    const max = (control as HTMLInputElement).maxLength;
    if (kind === "longtext" && max > 0 && max < 100000) question.maxLength = max;
    if ((kind === "choice" || kind === "multi") && driver.options && (readOptions || !driver.name.startsWith("combobox"))) {
      question.options = await driver.options(box);
    }
    log.debug(`field “${question.text}”`, { kind, driver: driver.name, key: question.key, required: question.required || undefined, options: question.options?.slice(0, 12) });
    out.push({ el: box, driver, question });
  }
  return out;
}

/** Visible application form: the form with the most fields. */
export function mainForm(doc: Document): Element | null {
  const forms = [...doc.querySelectorAll("form")].filter(isVisible);
  let best: Element | null = null;
  let most = 2; // at least three fields to count as an application
  for (const f of forms) {
    const n = controlsIn(f, {}).filter((c) => !c.matches("input[type=search]")).length;
    if (n > most) {
      most = n;
      best = f;
    }
  }
  return best;
}

/** Does the page look like a job application (vs. a login or search box)? */
export function looksLikeApplication(doc: Document): boolean {
  const form = mainForm(doc) ?? doc.body;
  const labels = controlsIn(form, {}).map((c) => keyOf(c) ?? keyFromLabel(questionOf(c.parentElement ?? c, c)));
  const keys = new Set(labels.filter(Boolean));
  const hasResume = !!form.querySelector("input[type=file]");
  return (keys.has("email") && (keys.has("firstName") || keys.has("fullName") || keys.has("lastName"))) || (hasResume && keys.has("email"));
}

/** A SiteAdapter for one ATS (or any page) from hints. */
export function formAdapter(spec: {
  name: string;
  active(doc: Document): boolean;
  company(doc: Document): string;
  pageLabel?(doc: Document): string;
  hints: FormHints;
}): SiteAdapter {
  return {
    name: spec.name,
    active: spec.active,
    company: spec.company,
    pageLabel: (doc) => spec.pageLabel?.(doc) ?? "Application",
    async fields(doc, skip, opts) {
      const root = spec.hints.root?.(doc) ?? mainForm(doc) ?? doc.body;
      return scanForm(root, spec.hints, skip, opts?.readOptions !== false);
    },
  };
}

/** Employer from page metadata: og:site_name, or a "<title> at <Company>" title. */
export function companyFromMeta(doc: Document): string {
  const og = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if (og && !/greenhouse|lever|ashby|workday|jobs?$/i.test(og)) return og;
  const t = doc.title;
  const m = t.match(/\bat\s+(.+?)(?:\s*[|\-–—]|$)/i) ?? t.match(/[|\-–—]\s*([^|\-–—]+?)\s*(?:careers|jobs)?\s*$/i);
  return m?.[1]?.trim() ?? "";
}
