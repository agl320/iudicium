// Test entry: the engine and Workday adapter without chrome.* APIs or the
// panel, exposed on window for Playwright.

import { fillPage, harvest, mergeSaved } from "./core/engine";
import type { Profile, SavedAnswer } from "./core/profile";
import { sampleProfile } from "./core/profile";
import { workday } from "./sites/workday/adapter";
import { dump, entries, setDebug } from "./debug/log";

type Opts = { saved?: SavedAnswer[]; overwrite?: boolean; today?: string };

let last: Awaited<ReturnType<typeof fillPage>> = [];

const api = {
  sampleProfile,
  async fill(profile: Profile, opts: Opts = {}) {
    const ctx = {
      profile,
      saved: opts.saved ?? [],
      company: workday.company(document),
      today: opts.today ? new Date(opts.today) : new Date(),
    };
    last = await fillPage(workday, document, ctx, { overwrite: opts.overwrite });
    return {
      page: workday.pageLabel(document),
      company: ctx.company,
      items: last.map(({ question, kind, status, source, confidence, detail }) => ({ question, kind, status, source, confidence, detail })),
    };
  },
  setDebug,
  log: () => dump(),
  entries: () => entries().map(({ level, scope, msg }) => ({ level, scope, msg })),
  remember(existing: SavedAnswer[] = []) {
    return mergeSaved(existing, harvest(last, workday.company(document)));
  },
};

(window as unknown as { __iud: typeof api }).__iud = api;
