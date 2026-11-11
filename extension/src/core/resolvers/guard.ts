// Questions the autofill must never answer for you: legal attestations,
// consents, signatures. Claimed first so no later resolver (or AI) sees them.

import type { Answer, Resolver } from "../types";

const LEGAL =
  /\b(certify|attest|acknowledg\w*|consent\w*|signature|e-?sign\w*|terms (?:and|&) conditions|terms of (?:use|service)|privacy (?:policy|notice|statement)|non-?compete|non-?solicit\w*|i agree|agree to|opt[- ]?in|receive (?:sms|text|whatsapp|marketing))\b/i;

export const guardResolver: Resolver = {
  name: "guard",
  resolve(questions) {
    const out = new Map<string, Answer>();
    for (const q of questions) {
      if (q.key) continue; // known profile fields (name, date on a signature block...) are fine
      if (q.kind === "file") {
        out.set(q.id, { value: "", manual: true, confidence: "high", source: "guard", evidence: "Attach files by hand (for now)" });
      } else if (q.kind === "unknown") {
        out.set(q.id, { value: "", manual: true, confidence: "high", source: "guard", evidence: "Unrecognized field type" });
      } else if (LEGAL.test(q.text)) {
        out.set(q.id, { value: "", manual: true, confidence: "high", source: "guard", evidence: "Legal / consent: your call" });
      }
    }
    return out;
  },
};
