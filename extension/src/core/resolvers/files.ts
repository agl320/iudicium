// Upload fields: the profile's resume (and cover letter, if it has one).
// Anything else (transcripts, portfolios...) is left to the guard: by hand.

import type { Answer, Resolver } from "../types";
import { norm } from "../match";

export const filesResolver: Resolver = {
  name: "files",
  resolve(questions, ctx) {
    const out = new Map<string, Answer>();
    const p = ctx.profile;
    for (const q of questions) {
      if (q.kind !== "file") continue;
      const t = norm(q.text);
      const file = /cover letter/.test(t) ? p.coverLetterFile : /resume|résumé|\bcv\b|curriculum/.test(t) || t === "" ? p.resumeFile : undefined;
      if (!file) continue;
      out.set(q.id, { value: file.name, file, confidence: "high", source: "file", evidence: `profile: ${/cover/.test(t) ? "cover letter" : "resume"} file` });
    }
    return out;
  },
};
