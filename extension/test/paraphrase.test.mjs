// Benchmark: after learning one wording, how often is a reworded question
// recognized (recall), and is a different question ever filled (it must not be)?
//   REPORT=1 node --test test/paraphrase.test.mjs   prints every pair's score

import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryIndex, confidenceOf, emptyMemory, kindGroup, learn } from "./.build/learn.mjs";

const YN = ["Yes", "No"];

// [learned wording, new wording] — same question.
const SAME = [
  ["Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?", "Do you need visa sponsorship to work for us?"],
  ["Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?", "Will you require the company to sponsor your visa?"],
  ["Are you legally authorized to work in the United States?", "Are you eligible to work in the United States?"],
  ["Are you legally authorized to work in the United States?", "Do you have the legal right to work in the United States?"],
  ["Have you previously worked for Acme Corp?", "Have you ever been employed by Acme Corp?"],
  ["Have you previously worked for Acme Corp?", "Are you a former employee of Acme Corp?"],
  ["Are you willing to relocate?", "Would you be open to relocation?"],
  ["Are you willing to relocate?", "Are you willing to relocate for this position?"],
  ["Are you willing to travel up to 25% of the time?", "Are you comfortable with travel up to 25%?"],
  ["Do you have any relatives working at Acme Corp?", "Are you related to anyone currently employed by Acme Corp?"],
  ["Do you currently hold an active security clearance?", "Do you have an active security clearance?"],
  ["What is your notice period?", "How much notice do you need to give your current employer?"],
  ["What are your salary expectations?", "What is your expected salary?"],
  ["What is your desired compensation?", "What are your compensation expectations?"],
  ["Which year of study are you currently in?", "What is your current year of study?"],
  ["Are you able to work on-site in Vancouver five days a week?", "Can you work on-site in Vancouver five days a week?"],
  ["Why do you want to work at Acme Corp?", "Why are you interested in working at Acme Corp?"],
  ["Why do you want to work at Acme Corp?", "What interests you about Acme Corp?"],
  ["How did you hear about this position?", "How did you find out about this job?"],
  ["Are you a citizen of Canada?", "Do you hold Canadian citizenship?"],
];

// [learned, new] — look alike, but the answer may differ: must never be filled.
const DIFFERENT = [
  ["Do you have experience with Kubernetes?", "Do you have experience with Docker?"],
  ["Are you legally authorized to work in the United States?", "Are you legally authorized to work in Canada?"],
  ["Will you be graduating between January 2027 and June 2027?", "Will you be graduating between January 2028 and June 2028?"],
  ["Are you willing to travel up to 25% of the time?", "Are you willing to travel up to 75% of the time?"],
  ["Do you have at least 3 years of experience with Python?", "Do you have at least 5 years of experience with Python?"],
  ["Are you able to work on-site in Vancouver?", "Are you able to work on-site in Toronto?"],
  ["Are you currently enrolled in a Master's program?", "Are you currently enrolled in a PhD program?"],
  ["Have you previously worked for Acme Corp?", "Are you willing to relocate?"],
  ["What is your notice period?", "What is your expected salary?"],
  ["Are you willing to relocate?", "Are you willing to travel?"],
];

function trial(learned, asked, kind) {
  const options = kind === "choice" ? YN : undefined;
  const { memory } = learn(emptyMemory(), [{ question: learned, kind, options, value: kind === "choice" ? "Yes" : "an answer", company: "Acme Corp" }]);
  const m = new MemoryIndex(memory).match(asked, { company: "Acme Corp", group: kindGroup(kind, options), options })[0];
  return { score: m?.score ?? 0, level: m ? confidenceOf(m) : null, guard: m?.guard };
}

const kindOf = (q) => (/^(what|how|which|why)\b/i.test(q) ? "text" : "choice");

test("reworded questions are recognized (filled or suggested)", () => {
  let filled = 0;
  let suggested = 0;
  const misses = [];
  for (const [a, b] of SAME) {
    const r = trial(a, b, kindOf(a));
    if (process.env.REPORT) console.log(`${r.score.toFixed(2)} ${r.level ?? "-"}  ${a}  ⇢  ${b}`);
    if (r.level === "high" || r.level === "medium") filled++;
    else if (r.level === "suggest") suggested++;
    else misses.push(`${r.score.toFixed(2)} ${b}`);
  }
  console.log(`  same question: ${filled}/${SAME.length} filled, ${suggested} suggested, ${misses.length} missed`);
  assert.equal(misses.length, 0, `missed:\n${misses.join("\n")}`);
  assert.ok(filled >= SAME.length * 0.85, `only ${filled} filled`);
});

test("look-alike questions are never filled", () => {
  const wrong = [];
  for (const [a, b] of DIFFERENT) {
    const r = trial(a, b, kindOf(a));
    if (process.env.REPORT) console.log(`${r.score.toFixed(2)} ${r.level ?? "-"} ${r.guard ?? ""}  ${a}  ⇢  ${b}`);
    if (r.level === "high" || r.level === "medium") wrong.push(`${r.score.toFixed(2)} ${a} ⇢ ${b}`);
  }
  assert.deepEqual(wrong, []);
});
