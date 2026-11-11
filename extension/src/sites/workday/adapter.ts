// Workday (any employer: *.myworkdayjobs.com, *.myworkdaysite.com).
//
// Every field, standard or employer-defined, is a container with
// data-automation-id="formField-<name>" holding a label/legend and one widget.
// The adapter turns those into Questions; it doesn't need to know what an
// employer's custom questions mean. Only the repeating sections on
// "My Experience" (work history, education) get dedicated code.

import type { SiteAdapter, FillOptions } from "../../core/engine";
import { apply } from "../../core/engine";
import type { Answer, CanonicalKey, Context, Field, FieldDriver, Question, ReportItem } from "../../core/types";
import { LEVEL_NAMES, type Education, type Experience } from "../../core/profile";
import { employerIn, norm } from "../../core/match";
import { isVisible, realClick, sleep, text, waitFor, labelOf } from "../../dom/events";
import { GENERIC_DRIVERS, driverFor } from "../../drivers";
import { dateDriver, promptDriver } from "./drivers";
import { logger, snapshot } from "../../debug/log";

const log = logger("workday");

const DRIVERS: FieldDriver[] = [dateDriver, promptDriver, ...GENERIC_DRIVERS];

const FIELD = '[data-automation-id^="formField-"]';
const PANEL = '[role="group"][aria-labelledby$="-panel"]';
const SECTION = '[role="group"][aria-labelledby$="-section"]';

// --- Page ----------------------------------------------------------------------------

const PAGE_NAMES: Record<string, string> = {
  applyFlowMyInfoPage: "My Information",
  applyFlowMyExpPage: "My Experience",
  applyFlowPrimaryQuestionsPage: "Application Questions",
  applyFlowSecondaryQuestionsPage: "Application Questions",
  applyFlowVoluntaryDisclosuresPage: "Voluntary Disclosures",
  applyFlowSelfIdentificationPage: "Self Identify",
  applyFlowReviewPage: "Review",
};

/** The innermost visible step wrapper, e.g. applyFlowMyInfoPage. */
function pageEl(doc: Document): Element | null {
  const els = [...doc.querySelectorAll("[data-automation-id]")].filter((e) => {
    const id = e.getAttribute("data-automation-id")!;
    return /^applyFlow.*Page$/.test(id) && id !== "applyFlowPage" && isVisible(e);
  });
  return els.find((e) => !els.some((o) => o !== e && e.contains(o))) ?? null;
}

const pageRoot = (doc: Document) => pageEl(doc) ?? doc.querySelector('[data-automation-id="applyFlowPage"]') ?? doc.body;

// --- Field ids → canonical keys --------------------------------------------------------

const KEYS: Record<string, CanonicalKey> = {
  firstName: "firstName",
  middleName: "middleName",
  lastName: "lastName",
  preferredCheck: "hasPreferredName",
  email: "email",
  emailAddress: "email",
  phoneNumber: "phone",
  "phone-number": "phone",
  phoneType: "phoneType",
  "phone-device-type": "phoneType",
  countryPhoneCode: "phoneCountryCode",
  extension: "phoneExtension",
  addressLine1: "addressLine1",
  addressLine2: "addressLine2",
  city: "city",
  countryRegion: "region",
  postalCode: "postalCode",
  country: "country",
  linkedInAccount: "linkedin",
  candidateIsPreviousWorker: "previousWorker",
  source: "source",
};

function keyFor(id: string): CanonicalKey | undefined {
  if (/preferredName/i.test(id)) return /firstName$/i.test(id) ? "preferredFirstName" : undefined;
  return KEYS[id.split(/--|_/).pop() ?? ""];
}

/** "formField-legalName--firstName" → "legalName--firstName"; standalone inputs use their own id. */
function fieldId(el: Element): string {
  const auto = el.getAttribute("data-automation-id") ?? "";
  return auto.replace(/^formField-/, "");
}

// --- Questions -----------------------------------------------------------------------------

function cleanLabel(s: string) {
  return s.replace(/[*∗]/g, "").replace(/\s*\bRequired\b\s*$/i, "").replace(/\s+/g, " ").trim();
}

function questionText(el: Element): string {
  const legend = el.querySelector("legend");
  if (legend && text(legend)) return cleanLabel(text(legend));
  if (el.matches("input, textarea")) return cleanLabel(labelOf(el) || el.getAttribute("aria-label") || fieldId(el));
  const label = el.querySelector("label");
  if (label && text(label)) return cleanLabel(text(label));
  const labelled = el.querySelector("[aria-label]")?.getAttribute("aria-label");
  return cleanLabel(labelled ?? fieldId(el));
}

function isRequired(el: Element): boolean {
  return !!el.querySelector('abbr, [aria-required="true"]') || el.getAttribute("aria-required") === "true";
}

let nextId = 1;
const ids = new WeakMap<Element, string>();
const idOf = (el: Element) => {
  if (!ids.has(el)) ids.set(el, `q${nextId++}`);
  return ids.get(el)!;
};

async function toField(el: Element): Promise<Field | null> {
  const driver = driverFor(el, DRIVERS);
  if (!driver) {
    log.warn(`no driver for field “${questionText(el)}”`, { id: fieldId(el) });
    snapshot(`NO DRIVER ${questionText(el)}`, el);
    return null;
  }
  const kind = driver.kind(el);
  const question: Question = {
    id: idOf(el),
    text: questionText(el),
    kind,
    required: isRequired(el),
    key: keyFor(fieldId(el)),
  };
  const area = el.querySelector("textarea");
  if (area?.maxLength && area.maxLength > 0) question.maxLength = area.maxLength;
  if ((kind === "choice" || kind === "multi") && driver.options) question.options = await driver.options(el);
  log.debug(`field “${question.text}”`, {
    id: fieldId(el) || undefined,
    kind,
    driver: driver.name,
    key: question.key,
    required: question.required || undefined,
    options: question.options,
  });
  if ((kind === "choice" || kind === "multi") && driver.options && !question.options?.length) {
    log.warn(`could not read options for “${question.text}”`);
  }
  return { el, driver, question };
}

/** Every field container on the page, outside the repeating sections. */
function containers(root: Element): Element[] {
  const out: Element[] = [];
  for (const c of root.querySelectorAll(FIELD)) {
    if (!isVisible(c) || c.parentElement?.closest(FIELD) || c.closest(PANEL)) continue;
    out.push(c);
  }
  // Controls with their own automation id outside any formField (SMS opt-in, file upload...).
  for (const c of root.querySelectorAll("input[data-automation-id], textarea[data-automation-id]")) {
    const input = c as HTMLInputElement;
    if (c.closest(FIELD) || c.closest(PANEL) || c.closest('[data-automation-id="multiSelectContainer"]')) continue;
    if (input.type === "hidden" || (!isVisible(c) && !["checkbox", "radio", "file"].includes(input.type))) continue;
    if (/^dateSection/.test(c.getAttribute("data-automation-id") ?? "")) continue;
    out.push(c);
  }
  return out;
}

// --- Repeating sections (My Experience) ---------------------------------------------------

type EntryValues = Record<string, Omit<Answer, "source" | "confidence"> | undefined>;

function experienceValues(e: Experience): EntryValues {
  return {
    jobTitle: { value: e.title },
    companyName: { value: e.company },
    location: e.location ? { value: e.location } : undefined,
    currentlyWorkHere: { value: !e.end },
    startDate: { value: e.start },
    endDate: e.end ? { value: e.end } : undefined,
    roleDescription: e.description ? { value: e.description } : undefined,
  };
}

function educationValues(e: Education): EntryValues {
  return {
    schoolName: { value: e.school },
    school: { value: e.school },
    degree: { value: e.degree, candidates: LEVEL_NAMES[e.level] },
    fieldOfStudy: e.field ? { value: e.field } : undefined,
    gradeAverage: e.gpa ? { value: e.gpa } : undefined,
    firstYearAttended: e.start ? { value: e.start } : undefined,
    lastYearAttended: e.end ? { value: e.end } : undefined,
  };
}

/** Label fallbacks for tenants whose field ids differ. */
const ENTRY_LABELS: [RegExp, string][] = [
  [/job title|position|role$/, "jobTitle"],
  [/company|employer/, "companyName"],
  [/^location/, "location"],
  [/currently work/, "currentlyWorkHere"],
  [/^from|start date/, "startDate"],
  [/^to$|end date/, "endDate"],
  [/description|responsibilities/, "roleDescription"],
  [/school|university|institution/, "schoolName"],
  [/^degree/, "degree"],
  [/field of study|major|discipline/, "fieldOfStudy"],
  [/gpa|grade average|overall result/, "gradeAverage"],
];

function entryKey(el: Element): string {
  const id = fieldId(el).split("--").pop() ?? "";
  if (id) return id;
  const t = norm(questionText(el));
  return ENTRY_LABELS.find(([re]) => re.test(t))?.[1] ?? "";
}

const sectionName = (s: Element) =>
  text(s.querySelector("h3, h4")) || (s.getAttribute("aria-labelledby") ?? "").replace(/-section$/, "").replace(/-/g, " ");
const panelsOf = (s: Element) => [...s.querySelectorAll(PANEL)].filter(isVisible);
const addButtonOf = (s: Element) =>
  [...s.querySelectorAll('[data-automation-id="add-button"]')].filter((b) => !b.closest(PANEL) && isVisible(b)).pop() as HTMLElement | undefined;

async function fillSection(
  section: Element,
  label: string,
  entries: EntryValues[],
  report: ReportItem[],
  opts: FillOptions,
) {
  // Click Add until there are enough entries; existing ones are reused.
  for (let guard = 0; panelsOf(section).length < entries.length && guard < entries.length + 2; guard++) {
    const add = addButtonOf(section);
    if (!add) break;
    const before = panelsOf(section).length;
    log.debug(`${label}: clicking Add (${before} → ${entries.length} entries)`);
    realClick(add);
    if (!(await waitFor(() => panelsOf(section).length > before, 4000))) log.warn(`${label}: Add did not create an entry`);
    await sleep(250);
  }
  const panels = panelsOf(section);
  for (const [i, values] of entries.entries()) {
    const panel = panels[i];
    if (!panel) {
      report.push({ question: `${label} ${i + 1}`, kind: "unknown", status: "failed", detail: "Could not add an entry" });
      continue;
    }
    // Checkbox first: "I currently work here" removes the end date.
    const order = (k: string) => (k === "currentlyWorkHere" ? 0 : 1);
    const fields = [...panel.querySelectorAll(FIELD)].filter((c) => isVisible(c) && !c.parentElement?.closest(FIELD));
    fields.sort((a, b) => order(entryKey(a)) - order(entryKey(b)));
    for (const c of fields) {
      if (!c.isConnected || !isVisible(c)) continue; // removed by an earlier answer
      const key = entryKey(c);
      const v = values[key];
      const field = await toField(c);
      if (!field) continue;
      field.question.text = `${label} ${i + 1}: ${field.question.text}`;
      if (!v) {
        if (field.question.required) report.push({ question: field.question.text, kind: field.question.kind, status: "needs", el: c, field, detail: "Not in your profile" });
        continue;
      }
      report.push(await apply(field, { ...v, source: "profile", confidence: "high", evidence: `${label.toLowerCase()} ${i + 1}` }, opts));
    }
  }
  for (const panel of panels.slice(entries.length)) {
    report.push({ question: `${label}: extra entry`, kind: "unknown", status: "needs", el: panel, detail: "Empty entry; delete it if Workday requires its fields" });
  }
}

async function prefillSections(doc: Document, ctx: Context, report: ReportItem[], opts: FillOptions) {
  for (const section of [...pageRoot(doc).querySelectorAll(SECTION)].filter(isVisible)) {
    const name = sectionName(section);
    const n = norm(name);
    const repeating = panelsOf(section).length > 0 || !!addButtonOf(section);
    log.debug(`section “${name}”`, { repeating, entriesOnPage: panelsOf(section).length, hasAdd: !!addButtonOf(section) });
    if (!repeating) continue;
    if (/experience|employment|work history/.test(n)) {
      await fillSection(section, "Experience", ctx.profile.experience.map(experienceValues), report, opts);
    } else if (/education/.test(n)) {
      await fillSection(section, "Education", ctx.profile.education.map(educationValues), report, opts);
    } else {
      report.push({ question: name, kind: "unknown", status: "needs", el: section, detail: "Section not handled yet: fill by hand" });
    }
  }
}

// --- Adapter --------------------------------------------------------------------------------

export const workday: SiteAdapter = {
  name: "Workday",
  active: (doc) => !!doc.querySelector('[data-automation-id="applyFlowPage"]') || !!pageEl(doc),
  pageLabel(doc) {
    const id = pageEl(doc)?.getAttribute("data-automation-id") ?? "";
    if (PAGE_NAMES[id]) return PAGE_NAMES[id];
    const step = text(doc.querySelector('[data-automation-id="progressBarActiveStep"]'));
    return step.replace(/current step \d+ of \d+/i, "").trim() || id || "Application";
  },
  company(doc) {
    // "Have you previously been employed by Acme Corp?" names the employer.
    for (const legend of doc.querySelectorAll("legend, label")) {
      const name = employerIn(text(legend));
      if (name) {
        log.debug(`company from question: ${name}`);
        return name;
      }
    }
    const host = doc.location?.hostname ?? "";
    const tenant = host.endsWith("myworkdaysite.com") ? doc.location.pathname.split("/")[2] : host.split(".")[0];
    const found = tenant && !/^wd\d+$/.test(tenant) ? tenant : "";
    log.debug(`company from URL: ${found || "(none)"}`);
    return found;
  },
  async fields(doc, skip) {
    const out: Field[] = [];
    const root = pageRoot(doc);
    const list = containers(root).filter((c) => !skip?.has(c));
    log.debug(`${list.length} new field container(s) on “${this.pageLabel(doc)}”`, { root: root.getAttribute("data-automation-id") ?? root.tagName });
    for (const c of list) {
      const f = await toField(c);
      if (f) out.push(f);
    }
    return out;
  },
  prefill: prefillSections,
};
