// Voluntary self-identification (gender, Hispanic/Latino, race, veteran,
// disability). Deterministic and claimed here so EEO answers are never saved
// for reuse or sent to an AI resolver.

import type { Answer, Context, Question, Resolver } from "../types";
import { isPlaceholder, matchOne, norm, yesNoOption } from "../match";

type Category = "gender" | "orientation" | "transgender" | "hispanic" | "race" | "veteran" | "disability";

const DECLINE =
  /(decline|not wish|don'?t wish|do not wish|prefer not|not to (answer|disclose|self|specify|say|identify|provide)|choose not|do not want|don'?t want|not declared|undisclosed|rather not)/i;

function category(q: Question): Category | null {
  const t = norm(q.text);
  if (/sexual orientation/.test(t)) return "orientation";
  if (/transgender/.test(t)) return "transgender";
  if (/disabilit/.test(t)) return "disability";
  if (/veteran|military status|armed forces/.test(t)) return "veteran";
  const opts = (q.options ?? []).map(norm);
  if (/hispanic|latin[oax]/.test(t) && (opts.length === 0 || opts.some((o) => /^yes|^no/.test(o)))) return "hispanic";
  if (/\b(race|ethnicity|ethnic)\b/.test(t)) return "race";
  if (/\b(gender|sex)\b/.test(t)) return "gender";
  // Some forms only say "Please check one of the boxes below" (the US disability form).
  if (opts.some((o) => /have a disability|had a disability/.test(o))) return "disability";
  if (opts.some((o) => /protected veteran/.test(o))) return "veteran";
  return null;
}

/** Option index for the profile's answer in a category, or -1. */
function pick(cat: Category, options: string[], ctx: Context): number {
  const e = ctx.profile.eeo;
  const o = options.map(norm);
  const decline = () => o.findIndex((x) => DECLINE.test(x));
  const find = (re: RegExp, not?: RegExp) => o.findIndex((x) => re.test(x) && !(not && not.test(x)));
  switch (cat) {
    case "orientation":
    case "transgender":
      return decline();
    case "gender":
      if (e.gender === "decline") return decline();
      if (e.gender === "male") return find(/^(male|man)\b/);
      if (e.gender === "female") return find(/^(female|woman)\b/);
      return find(/non-?binary/);
    case "hispanic":
      if (e.hispanicLatino === "decline") return decline();
      return yesNoOption(options, e.hispanicLatino === "yes");
    case "race":
      if (e.race === "decline") return decline();
      return matchOne(options, e.race);
    case "veteran":
      if (e.veteran === "decline") return decline();
      if (e.veteran === "not") return find(/\bnot\b.*veteran|^no\b|i am not/);
      return find(/identify as|protected veteran|i am a .*veteran|^yes\b/, /\bnot\b|^no\b/);
    case "disability":
      if (e.disability === "decline") return decline();
      return find(e.disability === "yes" ? /^yes\b/ : /^no\b/);
  }
}

/** Wording to try when the options aren't known up front (search fields). */
function guesses(cat: Category, ctx: Context): string[] {
  const e = ctx.profile.eeo;
  const declines = ["I do not wish to answer", "I don't wish to answer", "Decline to self identify", "Prefer not to say"];
  switch (cat) {
    case "gender":
      return e.gender === "decline" ? declines : [e.gender === "nonbinary" ? "Non-binary" : e.gender === "male" ? "Male" : "Female"];
    case "hispanic":
      return e.hispanicLatino === "decline" ? declines : [e.hispanicLatino === "yes" ? "Yes" : "No"];
    case "race":
      return e.race === "decline" ? declines : [e.race];
    case "veteran":
      return e.veteran === "decline" ? declines : e.veteran === "not" ? ["I am not a protected veteran", "No"] : ["I identify as one or more", "Yes"];
    case "disability":
      return e.disability === "decline" ? ["I do not want to answer", ...declines] : [e.disability === "yes" ? "Yes" : "No"];
    default:
      return declines;
  }
}

export const eeoResolver: Resolver = {
  name: "eeo",
  resolve(questions, ctx) {
    const out = new Map<string, Answer>();
    for (const q of questions) {
      const cat = category(q);
      if (!cat || q.kind === "text" || q.kind === "longtext" || q.kind === "date") continue;
      const evidence = `EEO: ${cat}`;
      const options = (q.options ?? []).filter((o) => !isPlaceholder(o));
      if (q.kind === "search" || options.length === 0) {
        const [first, ...rest] = guesses(cat, ctx);
        out.set(q.id, { value: first, candidates: rest, confidence: "medium", source: "eeo", evidence });
        continue;
      }
      const i = pick(cat, options, ctx);
      if (i < 0) {
        out.set(q.id, { value: "", manual: true, confidence: "low", source: "eeo", evidence: `${evidence}: no matching option` });
        continue;
      }
      const value = q.kind === "multi" ? [options[i]] : options[i];
      out.set(q.id, { value, confidence: "high", source: "eeo", evidence });
    }
    return out;
  },
};
