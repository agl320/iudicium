// Content script: shows the panel on application pages and runs fills.

import { fillPage, harvest, mergeSaved, type SiteAdapter } from "../core/engine";
import type { ReportItem } from "../core/types";
import { logger } from "../debug/log";
import { workday } from "../sites/workday/adapter";
import { Panel } from "../ui/panel";
import { load, saveAnswers, setActive } from "./storage";

const ADAPTERS: SiteAdapter[] = [workday];
const log = logger("content");

let report: ReportItem[] = [];
let lastPage = "";
let profileLabel = "";

const adapterHere = () => ADAPTERS.find((a) => a.active(document));

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
      const ctx = { profile, saved: store.saved[profile.id] ?? [], company: adapter.company(document), today: new Date() };
      report = await fillPage(adapter, document, ctx, { overwrite });
      panel.setReport(report);
    } catch (e) {
      log.error("Fill crashed", e instanceof Error ? e.stack : String(e));
      panel.flash(`Fill stopped with an error: ${e instanceof Error ? e.message : e}. See the Log tab.`);
    }
  },
  async onRemember() {
    const adapter = adapterHere();
    if (!adapter || !report.length) return;
    try {
      const store = await load();
      const fresh = harvest(report, adapter.company(document));
      await saveAnswers(store.activeProfileId, mergeSaved(store.saved[store.activeProfileId] ?? [], fresh));
      panel.flash(fresh.length ? `Saved ${fresh.length} answer${fresh.length === 1 ? "" : "s"} for next time.` : "Nothing new to save.");
    } catch (e) {
      log.error("Remember failed", e instanceof Error ? e.stack : String(e));
      panel.flash("Could not save answers. See the Log tab.");
    }
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

async function refreshProfiles() {
  const store = await load();
  profileLabel = store.profiles.find((p) => p.id === store.activeProfileId)?.label ?? "";
  panel.setProfiles(
    store.profiles.map((p) => ({ id: p.id, label: p.label })),
    store.activeProfileId,
  );
}

// Workday is a single-page app: watch for the form appearing and for step changes.
let wasActive = false;
function tick() {
  const adapter = adapterHere();
  if (!!adapter !== wasActive) {
    wasActive = !!adapter;
    log.info(adapter ? `${adapter.name} application detected` : "Application form gone");
  }
  panel.show(!!adapter);
  if (!adapter) return;
  const page = adapter.pageLabel(document);
  if (page !== lastPage) {
    log.info(`Page: ${page}`, location.pathname);
    lastPage = page;
    panel.pageLabel = page;
    report = [];
    panel.setReport([]);
  }
}

void refreshProfiles();
chrome.storage.onChanged.addListener(() => void refreshProfiles());
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "toggle") panel.toggle();
});
setInterval(tick, 1000);
tick();
