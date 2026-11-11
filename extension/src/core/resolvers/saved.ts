// Answers you gave before ("Remember my answers"), matched by fingerprint.

import type { Answer, Resolver } from "../types";
import { fingerprint, isPlaceholder, matchOne, similarity } from "../match";
import type { SavedAnswer } from "../profile";

export const savedResolver: Resolver = {
  name: "saved",
  resolve(questions, ctx) {
    const out = new Map<string, Answer>();
    const usable = ctx.saved.filter((s) => !s.company || s.company.toLowerCase() === ctx.company.toLowerCase());
    for (const q of questions) {
      const fp = fingerprint(q.text, ctx.company);
      let hit: SavedAnswer | undefined = usable.find((s) => s.fingerprint === fp && s.kind === q.kind);
      let confidence: Answer["confidence"] = "high";
      if (!hit) {
        let best = 0.85;
        for (const s of usable) {
          const score = similarity(s.fingerprint, fp);
          if (score >= best && compatible(s.kind, q.kind)) {
            best = score;
            hit = s;
          }
        }
        confidence = "medium";
      }
      if (!hit) continue;
      // A saved choice is only useful if this form offers it.
      const options = q.options?.filter((o) => !isPlaceholder(o));
      if (options?.length && typeof hit.value === "string" && matchOne(options, hit.value) < 0) continue;
      out.set(q.id, {
        value: hit.value,
        confidence,
        source: "saved",
        evidence: confidence === "high" ? "your saved answer" : `your answer to “${hit.question}”`,
      });
    }
    return out;
  },
};

function compatible(a: string, b: string): boolean {
  const group = (k: string) => (k === "longtext" ? "text" : k === "yesno" ? "choice" : k);
  return group(a) === group(b);
}
