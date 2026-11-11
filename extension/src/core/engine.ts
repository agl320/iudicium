// Fill one page: the adapter finds fields, resolvers answer them, drivers
// write them, and every field ends up in the report. Never submits.

import type { Answer, AnswerValue, Context, Field, ReportItem, Resolver } from "./types";
import { fingerprint, norm } from "./match";
import type { SavedAnswer } from "./profile";
import { RESOLVERS } from "./resolvers";
import { logger, snapshot } from "../debug/log";

const log = logger("engine");
const short = (s: string) => (s.length > 70 ? s.slice(0, 69) + "…" : s);

export interface SiteAdapter {
  name: string;
  active(doc: Document): boolean;
  pageLabel(doc: Document): string;
  company(doc: Document): string;
  /** Fields on the current page that the generic pipeline should handle. */
  fields(doc: Document, skip?: Set<Element>): Promise<Field[]>;
  /** Site-specific work before the generic pass (e.g. repeating sections). */
  prefill?(doc: Document, ctx: Context, report: ReportItem[], opts: FillOptions): Promise<void>;
}

export type FillOptions = {
  overwrite?: boolean; // replace values already on the page
  resolvers?: Resolver[];
};

export async function resolveAll(fields: Field[], ctx: Context, resolvers = RESOLVERS): Promise<Map<string, Answer>> {
  const answers = new Map<string, Answer>();
  let left = fields.map((f) => f.question);
  for (const r of resolvers) {
    if (!left.length) break;
    const got = await r.resolve(left, ctx);
    const claimed = left.filter((q) => got.has(q.id) && !answers.has(q.id));
    for (const [id, a] of got) if (!answers.has(id)) answers.set(id, a);
    if (claimed.length) {
      log.debug(`resolver ${r.name}: ${claimed.length}/${left.length}`, claimed.map((q) => {
        const a = got.get(q.id)!;
        return `${short(q.text)} → ${a.manual ? "(manual)" : display(a.value)} [${a.confidence}]`;
      }));
    }
    left = left.filter((q) => !answers.has(q.id));
  }
  if (left.length) log.debug(`no resolver answered ${left.length}`, left.map((q) => `${short(q.text)} (${q.kind})`));
  return answers;
}

export const display = (v: AnswerValue | null) => (v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v));

function same(current: AnswerValue, answer: Answer): boolean {
  if (typeof current === "boolean" || typeof answer.value === "boolean") return String(current) === String(answer.value);
  return norm(display(current)) === norm(display(answer.value));
}

const isEmpty = (v: AnswerValue | null) => v === null || v === false || v === "" || (Array.isArray(v) && !v.length);

/** Write one answer, describe what happened, and log it. */
export async function apply(field: Field, answer: Answer | undefined, opts: FillOptions): Promise<ReportItem> {
  const start = performance.now();
  const item = await applyInner(field, answer, opts);
  const ms = Math.round(performance.now() - start);
  const line = `${item.status.toUpperCase()} ${short(item.question)}`;
  const data = { detail: item.detail, driver: field.driver.name, kind: item.kind, source: item.source, ms };
  if (item.status === "failed") {
    log.warn(line, data);
    snapshot(`FAILED ${item.question}`, field.el);
  } else if (item.status === "filled") log.debug(line, data);
  else log.info(line, data);
  return item;
}

async function applyInner(field: Field, answer: Answer | undefined, opts: FillOptions): Promise<ReportItem> {
  const q = field.question;
  const base: ReportItem = { question: q.text, kind: q.kind, status: "needs", el: field.el, field };
  if (!answer) {
    return { ...base, detail: q.required ? "Required: no answer found" : "No answer found", fingerprintable: true };
  }
  const meta = { source: answer.source, confidence: answer.confidence };
  if (answer.manual) return { ...base, ...meta, detail: answer.evidence };
  const reusable = answer.source === "saved" || answer.source === "screening" || answer.source === "ai";
  const current = field.driver.read(field.el);
  // Facts from your profile replace Workday's defaults and resume-parser guesses;
  // inferred answers defer to what's already there unless asked to replace.
  if (!isEmpty(current) && !opts.overwrite && answer.source !== "profile" && !same(current!, answer)) {
    return { ...base, ...meta, status: "kept", detail: `Kept “${display(current)}” (profile: “${display(answer.value)}”)`, fingerprintable: reusable };
  }
  let result;
  try {
    result = await field.driver.write(field.el, answer);
  } catch (e) {
    log.error(`driver ${field.driver.name} threw on “${short(q.text)}”`, e instanceof Error ? e.stack : String(e));
    result = { ok: false, note: e instanceof Error ? e.message : String(e) };
  }
  const why = answer.evidence ? ` · ${answer.evidence}` : "";
  return {
    ...base,
    ...meta,
    status: result.ok ? "filled" : "failed",
    detail: result.ok ? `${result.shown ?? display(answer.value)}${why}` : `${result.note ?? "could not fill"} (wanted “${display(answer.value)}”)`,
    fingerprintable: reusable || !result.ok,
    written: result.ok ? (field.driver.read(field.el) ?? undefined) : undefined,
  };
}

/** Fill the current page. Re-scans a few times, since answers can reveal
 *  follow-up questions. */
export async function fillPage(adapter: SiteAdapter, doc: Document, ctx: Context, opts: FillOptions = {}): Promise<ReportItem[]> {
  const report: ReportItem[] = [];
  const start = performance.now();
  log.info(`Fill started: ${adapter.name} · ${adapter.pageLabel(doc)}`, {
    company: ctx.company || "(unknown)",
    profile: ctx.profile.label,
    saved: ctx.saved.length,
    overwrite: !!opts.overwrite,
  });
  if (adapter.prefill) await log.time("site-specific sections", () => adapter.prefill!(doc, ctx, report, opts));
  const seen = new Set<Element>();
  for (let pass = 0; pass < 5; pass++) {
    const fields = await adapter.fields(doc, seen);
    if (pass > 0 || fields.length) log.debug(`pass ${pass + 1}: ${fields.length} new field(s)`);
    if (!fields.length) break;
    fields.forEach((f) => seen.add(f.el));
    const answers = await resolveAll(fields, ctx, opts.resolvers);
    for (const f of fields) report.push(await apply(f, answers.get(f.question.id), opts));
  }
  const count = (st: string) => report.filter((i) => i.status === st).length;
  log.info(`Fill finished in ${Math.round(performance.now() - start)} ms`, {
    filled: count("filled"),
    needs: count("needs"),
    failed: count("failed"),
    kept: count("kept"),
  });
  return report;
}

/** What you typed into fields the autofill couldn't (or got wrong), as saved
 *  answers. Profile, EEO and legal fields are never saved. */
export function harvest(report: ReportItem[], company: string, perCompany = false): SavedAnswer[] {
  const out: SavedAnswer[] = [];
  for (const item of report) {
    if (!item.fingerprintable || !item.field) continue;
    if (item.kind === "file" || item.kind === "unknown") continue;
    const value = item.field.driver.read(item.field.el);
    if (value === null || isEmpty(value)) continue; // untouched
    // Unchanged since the autofill wrote it: nothing new to learn.
    if (item.written !== undefined && display(value) === display(item.written)) continue;
    out.push({
      fingerprint: fingerprint(item.question, company),
      question: item.question,
      kind: item.kind,
      value,
      company: perCompany ? company : undefined,
      updated: new Date().toISOString(),
    });
  }
  log.info(`Remember: ${out.length} answer(s)`, out.map((s) => `${s.fingerprint} → ${display(s.value)}`));
  return out;
}

export function mergeSaved(existing: SavedAnswer[], incoming: SavedAnswer[]): SavedAnswer[] {
  const key = (s: SavedAnswer) => `${s.fingerprint}|${s.kind}|${s.company ?? ""}`;
  const map = new Map(existing.map((s) => [key(s), s]));
  for (const s of incoming) map.set(key(s), s);
  return [...map.values()];
}
