// Test entry: the engine and site adapters without chrome.* APIs or the
// panel, exposed on window for Playwright. The adapter is detected like the
// extension does (Workday, Greenhouse, Ashby, Lever, else the generic form).

import { fillPage, observe } from "./core/engine";
import type { Profile } from "./core/profile";
import { sampleProfile } from "./core/profile";
import { emptyMemory, learn, type Memory } from "./core/learn/memory";
import { ADAPTERS, adapterFor } from "./sites";
import type { SiteAdapter } from "./core/engine";
import { dump, entries, setDebug } from "./debug/log";

type Opts = { memory?: Memory; otherMemories?: Memory[]; overwrite?: boolean; today?: string; adapter?: string };

const pick = (name?: string): SiteAdapter => (name ? ADAPTERS.find((a) => a.name === name)! : adapterFor(document) ?? ADAPTERS[0]);
let current: SiteAdapter = ADAPTERS[0];

let last: Awaited<ReturnType<typeof fillPage>> = [];

const api = {
  sampleProfile,
  emptyMemory,
  detect: () => adapterFor(document)?.name ?? null,
  async fill(profile: Profile, opts: Opts = {}) {
    current = pick(opts.adapter);
    const workday = current;
    const ctx = {
      profile,
      memory: opts.memory ?? emptyMemory(),
      otherMemories: opts.otherMemories,
      company: workday.company(document),
      today: opts.today ? new Date(opts.today) : new Date(),
    };
    last = await fillPage(workday, document, ctx, { overwrite: opts.overwrite });
    return {
      adapter: current.name,
      page: workday.pageLabel(document),
      company: ctx.company,
      items: last.map(({ question, kind, status, source, confidence, detail, suggestion }) => ({
        question,
        kind,
        status,
        source,
        confidence,
        detail,
        suggestion: suggestion?.value,
      })),
    };
  },
  /** What "Next" would learn from the page as it is now. */
  async learn(memory: Memory = emptyMemory()) {
    const inReport = new Set(last.flatMap((i) => (i.el ? [i.el] : [])));
    const untouched = await current.fields(document, inReport, { readOptions: false });
    return learn(memory, observe(last, untouched, current.company(document)));
  },
  setDebug,
  log: () => dump(),
  entries: () => entries().map(({ level, scope, msg }) => ({ level, scope, msg })),
};

(window as unknown as { __iud: typeof api }).__iud = api;
