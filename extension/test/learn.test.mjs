// The learning core in Node: recognizing reworded questions, negation,
// names/dates guards, employer templating, corrections and overrides.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryIndex, answerFor, confidenceOf, emptyMemory, kindGroup, learn, normalize, skillIn } from "./.build/learn.mjs";

const YN = ["Select One", "Yes", "No"];
const at = (company) => ({ company });

/** Teach a sequence of answers; returns the memory. */
function teach(...obs) {
  let mem = emptyMemory();
  for (const o of obs) mem = learn(mem, [{ kind: "choice", options: YN, company: "Acme Corp", ...o }]).memory;
  return mem;
}

/** What the memory would answer for a question. */
function ask(mem, question, { kind = "choice", options = YN, company = "Acme Corp" } = {}) {
  const group = kindGroup(kind, options);
  const m = new MemoryIndex(mem).match(question, { company, group, options })[0];
  if (!m) return { level: null };
  const level = confidenceOf(m);
  return { level, value: level ? answerFor(m, company, options) : null, score: m.score, guard: m.guard, inverted: m.inverted };
}

test("recognizes a reworded question", () => {
  const mem = teach({ question: "Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?", value: "No" });
  for (const q of [
    "Do you need visa sponsorship to work for us?",
    "Will you require immigration sponsorship now or in the future?",
    "Would you need us to sponsor a work visa?",
  ]) {
    const r = ask(mem, q);
    assert.ok(r.level === "high" || r.level === "medium", `${q} → ${JSON.stringify(r)}`);
    assert.equal(r.value, false, q);
  }
});

test("opposite wording flips a yes/no answer", () => {
  const mem = teach({ question: "Will you require visa sponsorship to work for us?", value: "No" });
  const r = ask(mem, "Are you able to work for us without visa sponsorship?");
  assert.equal(r.inverted, true, JSON.stringify(r));
  assert.equal(r.value, true);
  assert.notEqual(r.level, "high"); // reviewed, not silent
});

test("different names or dates are not the same question", () => {
  const mem = teach(
    { question: "Do you have experience with Kubernetes?", value: "Yes" },
    { question: "Will you be graduating between January 2027 and June 2027?", value: "No" },
  );
  const docker = ask(mem, "Do you have experience with Docker?");
  assert.ok(docker.level === null || docker.value !== true, JSON.stringify(docker));
  const later = ask(mem, "Will you be graduating between January 2028 and June 2028?");
  assert.equal(later.level, null, JSON.stringify(later));
  assert.match(later.guard ?? "", /numbers\/dates/);
  // The same question again still matches.
  assert.equal(ask(mem, "Will you be graduating between January 2027 and June 2027?").value, false);
});

test("learns skills as facts", () => {
  const mem = teach({ question: "Do you have professional experience with Kubernetes?", value: "Yes" }, { question: "Are you familiar with Rust?", value: "No" });
  assert.deepEqual(mem.skills, { kubernetes: true, rust: false });
  assert.equal(skillIn("Do you have experience with Python or Java?"), null); // ambiguous: skipped
});

test("long answers are reused with the new employer's name, for review", () => {
  let mem = emptyMemory();
  mem = learn(mem, [{ question: "Why do you want to work at Acme Corp?", kind: "longtext", value: "I want to join Acme Corp because of its robots.", company: "Acme Corp" }]).memory;
  const r = ask(mem, "Why would you like to work for Globex?", { kind: "longtext", options: undefined, company: "Globex" });
  assert.equal(r.value, "I want to join Globex because of its robots.");
  assert.equal(r.level, "medium");
});

test("one answer collects many wordings", () => {
  const mem = teach(
    { question: "Are you willing to relocate?", value: "Yes" },
    { question: "Would you be open to relocating for this role?", value: "Yes", company: "Globex" },
    { question: "Are you willing to move to a new city for this position?", value: "Yes", company: "Initech" },
  );
  assert.equal(mem.concepts.length, 1, JSON.stringify(mem.concepts.map((c) => c.variants.map((v) => v.text))));
  assert.equal(mem.concepts[0].variants.length, 3);
  assert.equal(mem.concepts[0].stats.confirmed, 2);
});

test("a correction replaces the answer", () => {
  let mem = emptyMemory();
  mem = learn(mem, [{ question: "What is your notice period?", kind: "text", value: "2 weeks", company: "Acme Corp" }]).memory;
  const id = mem.concepts[0].id;
  mem = learn(mem, [{ question: "What is your notice period?", kind: "text", value: "1 month", company: "Acme Corp", conceptId: id, filled: "2 weeks", filledBy: "saved" }]).memory;
  assert.equal(mem.concepts.length, 1);
  assert.equal(mem.concepts[0].answer, "1 month");
  assert.equal(mem.concepts[0].stats.corrected, 1);
});

test("an established answer gets an employer-specific override instead of being replaced", () => {
  const mem = teach(
    { question: "Are you willing to relocate?", value: "Yes", company: "Acme Corp" },
    { question: "Are you willing to relocate?", value: "Yes", company: "Globex" },
    { question: "Are you willing to relocate?", value: "Yes", company: "Hooli" },
    { question: "Are you willing to relocate?", value: "No", company: "Initech" },
  );
  assert.equal(ask(mem, "Are you willing to relocate?", { company: "Initech" }).value, false);
  assert.equal(ask(mem, "Are you willing to relocate?", { company: "Pied Piper" }).value, true);
});

test("answers that keep getting changed lose confidence", () => {
  let mem = teach({ question: "Are you comfortable working on-site five days a week?", value: "Yes" });
  const id = mem.concepts[0].id;
  for (const [i, v] of ["No", "Yes", "No"].entries()) {
    mem = learn(mem, [{ question: "Are you comfortable working on-site five days a week?", kind: "choice", options: YN, value: v, company: `Co${i}`, conceptId: id, filled: v === "No" ? "Yes" : "No", filledBy: "saved" }]).memory;
  }
  assert.ok(mem.concepts[0].stats.corrected >= 3);
  assert.notEqual(ask(mem, "Are you comfortable working on-site five days a week?").level, "high");
});

test("rule answers you kept aren't memorized (the rule answers again next time)", () => {
  const { memory } = learn(emptyMemory(), [
    { question: "Are you at least 18 years of age?", kind: "choice", options: YN, value: "Yes", company: "Acme Corp", filled: "Yes", filledBy: "screening" },
  ]);
  assert.equal(memory.concepts.length, 0);
});

test("normalization folds synonyms and tracks negation", () => {
  const a = normalize("Are you legally authorised to work in Canada?");
  const b = normalize("Are you eligible to work in Canada?");
  assert.ok(a.tokens.includes("authorized") && b.tokens.includes("authorized"));
  assert.equal(normalize("Can you work without sponsorship?").polarity, 1);
  assert.equal(normalize("Do you require sponsorship?").polarity, 0);
  assert.ok(normalize("Have you worked for Globex before?").tokens.includes("company"));
});
