// Answers learned from you (see core/learn/memory.ts): the closest stored
// question wins if it's similar enough; weaker matches become suggestions.

import type { Answer, Resolver } from "../types";
import { answerFor, confidenceOf, kindGroup, MemoryIndex, type Match } from "../learn/memory";
import { logger } from "../../debug/log";

const log = logger("memory");
const pct = (s: number) => `${Math.round(s * 100)}%`;
const short = (s: string) => (s.length > 60 ? s.slice(0, 59) + "…" : s);

export const memoryResolver: Resolver = {
  name: "memory",
  resolve(questions, ctx) {
    const out = new Map<string, Answer>();
    const own = new MemoryIndex(ctx.memory);
    const others = (ctx.otherMemories ?? []).map((m) => new MemoryIndex(m));
    for (const q of questions) {
      const group = kindGroup(q.kind, q.options);
      if (!group) continue;
      const opts = { company: ctx.company, group, options: q.options };
      const candidates = own.match(q.text, opts);
      const best = candidates[0];
      if (best) {
        log.debug(`“${short(q.text)}”`, candidates.slice(0, 3).map((m) => `${pct(m.score)} “${short(m.variant)}”${m.inverted ? " (opposite wording)" : ""}${m.guard ? ` [${m.guard}]` : ""}`));
      }
      const level = best ? confidenceOf(best) : null;
      const value = best && level ? answerFor(best, ctx.company, q.options) : null;
      if (best && level && value !== null) {
        out.set(q.id, {
          value,
          confidence: level === "suggest" ? "low" : level,
          suggest: level === "suggest",
          source: "saved",
          conceptId: best.concept.id,
          score: best.score,
          evidence: evidence(best),
        });
        continue;
      }
      // Another profile answered something like this: offer it, never fill.
      for (const idx of others) {
        const m = idx.match(q.text, opts)[0];
        const v = m && confidenceOf(m) && confidenceOf(m) !== "suggest" ? answerFor(m, ctx.company, q.options) : null;
        if (m && v !== null) {
          out.set(q.id, { value: v, confidence: "low", suggest: true, source: "saved", score: m.score, evidence: `from another profile · ${evidence(m)}` });
          break;
        }
      }
    }
    return out;
  },
};

function evidence(m: Match): string {
  const { confirmed, corrected } = m.concept.stats;
  const history = confirmed || corrected ? `, kept ${confirmed}× changed ${corrected}×` : "";
  const scope = m.concept.company ? ` (for ${m.concept.company})` : "";
  return `${pct(m.score)} like “${short(m.variant)}”${m.inverted ? ", opposite wording" : ""}${scope}${history}`;
}
