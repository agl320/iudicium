// Content script: shows the panel on application pages, runs fills, and
// learns from what you answer (automatically when you click Next). Declared
// for Workday, Greenhouse, Ashby and Lever; injected on any other site when
// you click the toolbar button (generic form scanner).

import { display, fillPage, observe } from "../core/engine";
import { learn, markUsed } from "../core/learn/memory";
import type { ReportItem } from "../core/types";
import { logger } from "../debug/log";
import { text } from "../dom/events";
import { adapterFor } from "../sites";
import { Panel } from "../ui/panel";
import { load, memoryOf, saveMemory, saveSettings, setActive, type Settings } from "./storage";
import { jobTitle, markSubmitted, track } from "./track";

// Injected twice (declared + toolbar click)? Keep the first copy.
const w = window as unknown as { __iudiciumContent?: boolean };
if (w.__iudiciumContent) throw new Error("iudicium content script already running");
w.__iudiciumContent = true;

const log = logger("content");

let report: ReportItem[] = [];
let lastPage = "";
let profileLabel = "";
let settings: Settings = { autoLearn: true };
/** question → value already learned on this page (no double counting). */
let learnedHere = new Map<string, string>();

const adapterHere = () => adapterFor(document);
const errText = (e: unknown) => (e instanceof Error ? e.stack ?? e.message : String(e));

const panel = new Panel({
  async onFill(overwrite) {
    const adapter = adapterHere();
    if (!adapter) {
      log.warn("Fill clicked but no application form was recognized");
      return panel.flash("No application form found on this page.");
    }
    try {
      const store = await load();
      const profile = store.profiles.find((p) => p.id === store.activeProfileId)!;
      profileLabel = profile.label;
      const ctx = {
        profile,
        memory: memoryOf(store, profile.id),
        otherMemories: store.profiles.filter((p) => p.id !== profile.id).map((p) => memoryOf(store, p.id)),
        company: adapter.company(document),
        today: new Date(),
      };
      report = await fillPage(adapter, document, ctx, { overwrite });
      panel.setReport(report);
      await track({
        url: location.href,
        company: ctx.company,
        title: jobTitle(document),
        site: adapter.name,
        profileId: profile.id,
        profileLabel: profile.label,
        resumeId: profile.origin?.resumeId,
        resumeTitle: profile.origin?.resumeTitle,
        resumeFile: report.some((i) => i.source === "file" && i.status === "filled") ? profile.resumeFile?.name : undefined,
        filled: report.filter((i) => i.status === "filled").length,
        needs: report.filter((i) => i.status === "needs").length,
      }).catch((e) => log.warn("Could not record the application", errText(e)));
      const used = report.flatMap((i) => (i.status === "filled" && i.answer?.conceptId ? [i.answer.conceptId] : []));
      if (used.length) await saveMemory(profile.id, markUsed(ctx.memory, used));
    } catch (e) {
      log.error("Fill crashed", errText(e));
      panel.flash(`Fill stopped with an error: ${e instanceof Error ? e.message : e}. See the Log tab.`);
    }
  },
  onLearn: () => learnFromPage("button"),
  async onApplySuggestion(item) {
    const s = item.suggestion;
    const f = item.field;
    if (!s || !f) return;
    const answer = { ...s, suggest: false, confidence: "medium" as const };
    const res = await f.driver.write(f.el, answer);
    if (!res.ok) {
      log.warn(`Suggestion could not be applied to “${item.question}”`, res.note);
      return panel.flash(`Could not apply: ${res.note ?? "unknown error"}`);
    }
    Object.assign(item, {
      status: "filled",
      answer,
      source: "saved",
      confidence: "medium",
      suggestion: undefined,
      written: f.driver.read(f.el) ?? undefined,
      detail: `${res.shown ?? display(s.value)} · accepted suggestion`,
    });
    log.info(`Suggestion accepted: “${item.question}”`, display(s.value));
    panel.setReport(report);
  },
  onAutoLearn(on) {
    settings = { ...settings, autoLearn: on };
    void saveSettings(settings);
    log.info(`Automatic learning ${on ? "on" : "off"}`);
  },
  onProfile: (id) => {
    log.info(`Profile switched to ${id}`);
    void setActive(id);
  },
  onOptions: () => void chrome.runtime.sendMessage({ type: "openOptions" }),
  logContext: () => ({
    version: chrome.runtime.getManifest?.().version ?? "?",
    page: lastPage,
    profile: profileLabel,
    browser: navigator.userAgent,
  }),
});

/** Read every answer on the page (filled or typed by you) and learn from it.
 *  The page is read before anything async happens, since Next navigates away. */
async function learnFromPage(trigger: "next" | "button") {
  const adapter = adapterHere();
  if (!adapter) return;
  try {
    const company = adapter.company(document);
    const inReport = new Set(report.flatMap((i) => (i.el ? [i.el] : [])));
    const untouched = await adapter.fields(document, inReport, { readOptions: false });
    const obs = observe(report, untouched, company).filter((o) => learnedHere.get(o.question) !== display(o.value));
    for (const o of obs) learnedHere.set(o.question, display(o.value));
    if (!obs.length) {
      if (trigger === "button") panel.flash("Nothing new to learn on this page.");
      return;
    }
    const store = await load();
    const id = store.activeProfileId;
    const { memory, changes } = learn(memoryOf(store, id), obs);
    await saveMemory(id, memory);
    log.info(`Learned from ${obs.length} answer(s) (${trigger})`, changes);
    if (changes.length) panel.flash(`Learned: ${changes.slice(0, 3).join("; ")}${changes.length > 3 ? ` (+${changes.length - 3} more)` : ""}`);
    else if (trigger === "button") panel.flash("Nothing new to learn on this page.");
  } catch (e) {
    log.error("Learning failed", errText(e));
    if (trigger === "button") panel.flash("Could not learn from this page. See the Log tab.");
  }
}

// Workday's Next / Save and Continue / Submit: learn before the page changes.
const SUBMIT = /^(submit( application| my application)?|send application|apply now|complete application)$/i;
const NEXT_IDS = /pageFooterNextButton|bottom-navigation-next-button|pageFooterSubmitButton|bottom-navigation-submit|bottom-navigation-save/;
document.addEventListener(
  "click",
  (e) => {
    if (!settings.autoLearn) return;
    const btn = (e.target as Element | null)?.closest?.("button, [role=button]");
    if (!btn || !adapterHere()) return;
    const id = btn.getAttribute("data-automation-id") ?? "";
    const label = text(btn);
    if (NEXT_IDS.test(id) || /^(save and continue|next|continue|submit|review)$/i.test(label) || SUBMIT.test(label)) void learnFromPage("next");
    if (/submit/i.test(id) || SUBMIT.test(label)) void markSubmitted(location.href).then(() => log.info("Application marked as submitted"));
  },
  true,
);

async function refresh() {
  const store = await load();
  settings = store.settings;
  profileLabel = store.profiles.find((p) => p.id === store.activeProfileId)?.label ?? "";
  panel.setProfiles(
    store.profiles.map((p) => ({ id: p.id, label: p.label })),
    store.activeProfileId,
  );
  panel.setAutoLearn(settings.autoLearn);
}

// Workday is a single-page app: watch for the form appearing and for step changes.
let wasActive = false;
/** Opened from the toolbar: stay visible even where no form was recognized. */
let pinned = false;
function tick() {
  const adapter = adapterHere();
  if (!!adapter !== wasActive) {
    wasActive = !!adapter;
    log.info(adapter ? `${adapter.name} application detected` : "Application form gone");
  }
  panel.show(!!adapter || pinned);
  if (!adapter) return;
  const page = adapter.pageLabel(document);
  if (page !== lastPage) {
    log.info(`Page: ${page}`, location.pathname);
    lastPage = page;
    panel.pageLabel = page;
    report = [];
    learnedHere = new Map();
    panel.setReport([]);
  }
}

void refresh();
chrome.storage.onChanged.addListener(() => void refresh());
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "toggle") {
    pinned = true;
    panel.toggle();
    if (!adapterHere()) panel.flash("No application form recognized on this page yet. Open the form, then click Fill.");
  }
});
setInterval(tick, 1000);
tick();
