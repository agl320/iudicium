// What the autofill has learned from you, and how it recognizes a question it
// has seen before in different words.
//
// Each "concept" is one answer plus every wording of the question it was given
// for. A new question is compared with all stored wordings (nearest
// neighbour): TF-IDF-weighted tokens after synonym folding, plus character
// trigrams, with hard guards for negation and for names/numbers/dates.
// Feedback (kept vs changed) adjusts how much each concept is trusted.

import type { AnswerValue, Confidence, QuestionKind } from "../types";
import { companyVariants, isPlaceholder, matchOne, norm, yesNoOption } from "../match";
import { isGeneric, jaccard, normalize, skillIn, trigrams, type Normalized } from "./text";

export type Variant = { text: string; options?: string[]; company?: string; at: string };

export type Concept = {
  id: string;
  kind: KindGroup;
  answer: AnswerValue; // booleans for yes/no; long text may contain {company}
  display?: string; // how a boolean was shown ("Yes, I am authorized")
  variants: Variant[];
  company?: string; // set = only for this employer
  companies: string[]; // employers where this answer was used and kept
  stats: { used: number; confirmed: number; corrected: number; created: string; updated: string };
};

export type Memory = {
  version: 2;
  concepts: Concept[];
  /** Learned from yes/no skill questions: "kubernetes" → true. */
  skills: Record<string, boolean>;
};

export type KindGroup = "bool" | "choice" | "multi" | "text" | "longtext" | "date";

export const emptyMemory = (): Memory => ({ version: 2, concepts: [], skills: {} });

export const THRESHOLDS = { high: 0.86, medium: 0.7, merge: 0.6, suggest: 0.5 };
const MAX_VARIANTS = 12;
const MAX_CONCEPTS = 600;

// --- Kinds and values ---------------------------------------------------------------

export function kindGroup(kind: QuestionKind, options?: string[], value?: AnswerValue): KindGroup | null {
  switch (kind) {
    case "yesno":
      return "bool";
    case "choice":
    case "search":
      if (typeof value === "boolean") return "bool";
      if (options && isYesNo(options)) return "bool";
      if (typeof value === "string" && /^(yes|no)\b/i.test(value) && (!options || options.length <= 3)) return "bool";
      return "choice";
    case "multi":
      return "multi";
    case "text":
      return "text";
    case "longtext":
      return "longtext";
    case "date":
      return "date";
    default:
      return null;
  }
}

function isYesNo(options: string[]) {
  const real = options.filter((o) => !isPlaceholder(o));
  return real.length >= 2 && real.length <= 3 && yesNoOption(real, true) >= 0 && yesNoOption(real, false) >= 0;
}

/** Value as stored: booleans for yes/no, employer name → {company} in text. */
function canonicalValue(group: KindGroup, value: AnswerValue, company: string): AnswerValue {
  if (group === "bool") {
    if (typeof value === "boolean") return value;
    const s = norm(Array.isArray(value) ? value[0] : value);
    return /^(yes|y|true|i am|i do|i have|i will)\b/.test(s) && !/\bnot\b/.test(s);
  }
  if ((group === "text" || group === "longtext") && typeof value === "string") {
    let v = value;
    for (const c of companyVariants(company)) v = v.replace(new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "{company}");
    return v;
  }
  return value;
}

const same = (a: AnswerValue, b: AnswerValue) =>
  JSON.stringify(Array.isArray(a) ? [...a].map(norm).sort() : typeof a === "string" ? norm(a) : a) ===
  JSON.stringify(Array.isArray(b) ? [...b].map(norm).sort() : typeof b === "string" ? norm(b) : b);

// --- Similarity -----------------------------------------------------------------------

type Indexed = { concept: Concept; variant: Variant; n: Normalized; tri: Set<string> };

/** Pre-normalized wordings plus document frequencies for IDF weights. */
export class MemoryIndex {
  private items: Indexed[] = [];
  private df = new Map<string, number>();
  constructor(readonly memory: Memory) {
    for (const concept of memory.concepts) {
      for (const variant of concept.variants) {
        const n = normalize(variant.text, variant.company ?? concept.company ?? "");
        this.items.push({ concept, variant, n, tri: trigrams(n.joined) });
        for (const t of new Set(n.tokens)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      }
    }
  }

  private weight(t: string): number {
    // Unseen words count most; a background of 20 keeps tiny memories sane.
    const idf = Math.log(1 + (this.items.length + 20) / ((this.df.get(t) ?? 0) + 1));
    return isGeneric(t) ? idf * 0.25 : idf;
  }

  private vector(n: Normalized): Map<string, number> {
    const v = new Map<string, number>();
    for (const t of n.tokens) v.set(t, (v.get(t) ?? 0) + this.weight(t));
    return v;
  }

  /** 0..1 similarity of two normalized questions, plus why it was limited. */
  score(a: Normalized, b: Normalized, aTri = trigrams(a.joined), bTri = trigrams(b.joined)): { score: number; cap?: number; guard?: string } {
    const va = this.vector(a);
    const vb = this.vector(b);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (const [t, w] of va) {
      na += w * w;
      dot += w * (vb.get(t) ?? 0);
    }
    for (const w of vb.values()) nb += w * w;
    const cos = na && nb ? dot / Math.sqrt(na * nb) : 0;
    let score = 0.8 * cos + 0.2 * jaccard(aTri, bTri);

    // A short question fully inside a longer one ("notice period?" / "How much
    // notice do you need to give…?") counts, but only up to "review" level,
    // and only when the short one says at least two meaningful things.
    const cover = (x: Map<string, number>, y: Map<string, number>) => {
      let hit = 0;
      let all = 0;
      for (const [t, w] of x) {
        all += w;
        if (y.has(t)) hit += w;
      }
      return all ? hit / all : 0;
    };
    const content = (v: Map<string, number>) => [...v.keys()].filter((t) => !isGeneric(t)).length;
    const [short, long] = content(va) <= content(vb) ? [va, vb] : [vb, va];
    if (content(short) >= 2) score = Math.max(score, Math.min(0.84, 0.86 * cover(short, long)));

    // Numbers and dates must agree exactly ("before 2027" ≠ "before 2028").
    // (Codes like "H-1B" count as names, not numbers.)
    const nums = (n: Normalized) => new Set([...n.entities].filter((e) => /^\d+([.,]\d+)?%?$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(e)));
    const na_ = nums(a);
    const nb_ = nums(b);
    if ((na_.size || nb_.size) && jaccard(na_, nb_) < 1) return { score, cap: 0.45, guard: "different numbers/dates" };
    // Named things must overlap when both questions name something.
    const names = (n: Normalized) => new Set([...n.entities].filter((e) => !na_.has(e) && !nb_.has(e)));
    const ea = names(a);
    const eb = names(b);
    if (ea.size && eb.size && jaccard(ea, eb) === 0) return { score, cap: 0.45, guard: `different names (${[...ea][0]} vs ${[...eb][0]})` };
    if (ea.size !== eb.size && (ea.size === 0 || eb.size === 0)) score *= 0.93;
    return { score };
  }

  /** Best concepts for a question, most similar first. */
  match(question: string, opts: { company: string; group: KindGroup; options?: string[] }): Match[] {
    const q = normalize(question, opts.company);
    const qTri = trigrams(q.joined);
    const best = new Map<string, Match>();
    for (const it of this.items) {
      const c = it.concept;
      if (c.company && norm(c.company) !== norm(opts.company)) continue;
      if (!compatible(c.kind, opts.group)) continue;
      const scored = this.score(q, it.n, qTri, it.tri);
      let score = scored.score;
      // Same answer choices on offer: probably the same question.
      if (opts.options?.length && it.variant.options?.length && optionOverlap(opts.options, it.variant.options) >= 0.6) score += 0.05;
      // Guards win over bonuses.
      score = Math.min(1, scored.cap ?? 1, score);
      const guard = scored.guard;
      const inverted = q.polarity !== it.n.polarity;
      const prev = best.get(c.id);
      if (!prev || score > prev.score) best.set(c.id, { concept: c, score, inverted, variant: it.variant.text, guard });
    }
    // Employer-specific overrides beat general answers on ties.
    const rank = (m: Match) => m.score + (m.concept.company ? 0.03 : 0);
    return [...best.values()].sort((a, b) => rank(b) - rank(a));
  }
}

export type Match = { concept: Concept; score: number; inverted: boolean; variant: string; guard?: string };

function compatible(stored: KindGroup, asked: KindGroup) {
  if (stored === asked) return true;
  const textish = (k: KindGroup) => k === "text" || k === "longtext";
  return textish(stored) && textish(asked);
}

function optionOverlap(a: string[], b: string[]) {
  return jaccard(new Set(a.filter((o) => !isPlaceholder(o)).map(norm)), new Set(b.filter((o) => !isPlaceholder(o)).map(norm)));
}

/** How much to trust a match, after feedback. */
export function confidenceOf(m: Match): Confidence | "suggest" | null {
  const { confirmed, corrected } = m.concept.stats;
  let level: Confidence | "suggest" | null =
    m.score >= THRESHOLDS.high ? "high" : m.score >= THRESHOLDS.medium ? "medium" : m.score >= THRESHOLDS.suggest ? "suggest" : null;
  const demote = (l: typeof level): typeof level => (l === "high" ? "medium" : l === "medium" ? "suggest" : l === "suggest" ? null : l);
  if (corrected > confirmed + 1) level = demote(level); // keeps being changed
  if (m.inverted) level = m.concept.kind === "bool" ? (level === "high" ? "medium" : level) : demote(level);
  if (m.concept.kind === "longtext" && level === "high") level = "medium"; // always review long answers
  return level;
}

/** The stored answer, adapted to this question (negation, employer name, options). */
export function answerFor(m: Match, company: string, options?: string[]): AnswerValue | null {
  let v = m.concept.answer;
  if (typeof v === "boolean" && m.inverted) v = !v;
  if (typeof v === "string" && v.includes("{company}")) {
    if (!company) return null;
    v = v.replaceAll("{company}", company);
  }
  if (typeof v === "string" && options?.length && m.concept.kind === "choice") {
    const real = options.filter((o) => !isPlaceholder(o));
    const i = matchOne(real, v);
    if (i < 0) return null;
    v = real[i];
  }
  return v;
}

// --- Learning -------------------------------------------------------------------------

export type Observation = {
  question: string;
  kind: QuestionKind;
  options?: string[];
  value: AnswerValue; // what the field shows now
  company: string;
  /** Set when the autofill filled this field from a concept. */
  conceptId?: string;
  /** What the autofill wrote, if anything. */
  filled?: AnswerValue;
  /** The autofill's value came from a rule/profile rather than memory. */
  filledBy?: string;
};

export type LearnResult = { memory: Memory; changes: string[] };

/** Fold observations into memory: new concepts, new wordings of known ones,
 *  confirmations, corrections, employer-specific overrides, learned skills. */
export function learn(memory: Memory, observations: Observation[], now = new Date()): LearnResult {
  const mem: Memory = structuredClone(memory);
  const changes: string[] = [];
  const at = now.toISOString();
  for (const o of observations) {
    const group = kindGroup(o.kind, o.options, o.value);
    if (!group) continue;
    const value = canonicalValue(group, o.value, o.company);
    const index = new MemoryIndex(mem);

    // Facts: "Experience with Kubernetes? Yes" → you know Kubernetes.
    if (group === "bool") {
      const skill = skillIn(o.question);
      if (skill && mem.skills[skill] !== value) {
        mem.skills[skill] = value as boolean;
        changes.push(`skill ${skill}: ${value ? "yes" : "no"}`);
      }
    }

    const filledSame = o.filled !== undefined && same(canonicalValue(group, o.filled, o.company), value);
    let target: Concept | undefined = o.conceptId ? mem.concepts.find((c) => c.id === o.conceptId) : undefined;
    let inverted = false;
    if (target) {
      const m = index.match(o.question, { company: o.company, group, options: o.options }).find((x) => x.concept.id === target!.id);
      inverted = !!m?.inverted;
    } else {
      // Same answer: merge as another wording from 0.6. Different answer: only
      // treat it as a correction when clearly the same question.
      for (const m of index.match(o.question, { company: o.company, group, options: o.options })) {
        const stored = typeof value === "boolean" && m.inverted ? !value : value;
        const agrees = same(m.concept.answer, stored);
        if (m.score >= (agrees ? THRESHOLDS.merge : THRESHOLDS.medium)) {
          target = mem.concepts.find((c) => c.id === m.concept.id);
          inverted = m.inverted;
          break;
        }
        if (m.score < THRESHOLDS.merge) break;
      }
    }
    const asStored = typeof value === "boolean" && inverted ? !value : value;

    if (target && same(target.answer, asStored)) {
      // Same answer: one more wording, one more confirmation.
      addVariant(target, o, at);
      target.stats.confirmed++;
      target.stats.updated = at;
      if (o.company && !target.companies.includes(norm(o.company))) target.companies.push(norm(o.company));
      changes.push(`${o.conceptId ? "kept" : "confirmed"} “${short(o.question)}”`);
      continue;
    }
    if (target) {
      // Different answer to a question we recognized.
      const elsewhere = target.companies.filter((c) => c !== norm(o.company));
      const established = elsewhere.length >= 2 || (elsewhere.length >= 1 && target.stats.confirmed >= 2);
      if (!target.company && o.company && established) {
        // Long-standing general answer: keep it, override for this employer only.
        mem.concepts.push(newConcept(group, asStored, o, at, o.company));
        target.stats.corrected++;
        changes.push(`override for ${o.company}: “${short(o.question)}”`);
      } else {
        target.answer = asStored;
        target.display = displayOf(o.value);
        target.stats.corrected++;
        target.stats.updated = at;
        target.companies = o.company ? [norm(o.company)] : [];
        addVariant(target, o, at);
        changes.push(`corrected “${short(o.question)}”`);
      }
      continue;
    }
    if (o.filled !== undefined && filledSame && o.filledBy && o.filledBy !== "saved") {
      // A rule or profile answer you kept: nothing to memorize (the rule will answer again).
      continue;
    }
    mem.concepts.push(newConcept(group, value, o, at));
    changes.push(`learned “${short(o.question)}”`);
  }
  if (mem.concepts.length > MAX_CONCEPTS) {
    mem.concepts.sort((a, b) => b.stats.updated.localeCompare(a.stats.updated));
    mem.concepts.length = MAX_CONCEPTS;
  }
  return { memory: mem, changes };
}

/** A filled answer was used (counts toward ranking/cleanup). */
export function markUsed(memory: Memory, conceptIds: string[]): Memory {
  if (!conceptIds.length) return memory;
  const mem = structuredClone(memory);
  for (const c of mem.concepts) if (conceptIds.includes(c.id)) c.stats.used++;
  return mem;
}

function newConcept(group: KindGroup, value: AnswerValue, o: Observation, at: string, company?: string): Concept {
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind: group,
    answer: value,
    display: displayOf(o.value),
    variants: [{ text: o.question, options: o.options, company: o.company || undefined, at }],
    company: company ? norm(company) : undefined,
    companies: o.company ? [norm(o.company)] : [],
    stats: { used: 0, confirmed: 0, corrected: 0, created: at, updated: at },
  };
}

function addVariant(c: Concept, o: Observation, at: string) {
  const key = norm(normalize(o.question, o.company).joined);
  if (c.variants.some((v) => norm(normalize(v.text, v.company ?? "").joined) === key)) return;
  c.variants.push({ text: o.question, options: o.options, company: o.company || undefined, at });
  if (c.variants.length > MAX_VARIANTS) c.variants.splice(0, c.variants.length - MAX_VARIANTS);
}

const displayOf = (v: AnswerValue) => (Array.isArray(v) ? v.join(", ") : String(v));
const short = (s: string) => (s.length > 60 ? s.slice(0, 59) + "…" : s);

/** Older prototype format (exact-ish saved answers) → memory. */
export function fromSaved(saved: { question: string; kind: string; value: AnswerValue; company?: string; updated: string }[]): Memory {
  const mem = emptyMemory();
  for (const s of saved) {
    const group = kindGroup(s.kind as QuestionKind, undefined, s.value);
    if (!group) continue;
    mem.concepts.push(newConcept(group, canonicalValue(group, s.value, ""), { question: s.question, kind: s.kind as QuestionKind, value: s.value, company: "" }, s.updated, s.company));
  }
  return mem;
}
