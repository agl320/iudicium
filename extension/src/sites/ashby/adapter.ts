// Ashby: jobs.ashbyhq.com/<org>/<job>/application (also embedded in an iframe
// on company sites). Each question is an .ashby-application-form-field-entry;
// yes/no questions are two aria-pressed buttons, location is a combobox.

import type { CanonicalKey } from "../../core/types";
import { companyFromMeta, formAdapter } from "../form";
import { text } from "../../dom/events";

const PATHS: Record<string, CanonicalKey> = {
  _systemfield_name: "fullName",
  _systemfield_email: "email",
  _systemfield_location: "location",
  _systemfield_phone: "phone",
};

const CONSENT = ".ashby-application-form-texting-consent-description";
const ENTRY = ".ashby-application-form-field-entry";

export const ashby = formAdapter({
  name: "Ashby",
  active: (doc) => !!doc.querySelector(".ashby-application-form-container"),
  company(doc) {
    const meta = companyFromMeta(doc);
    if (meta) return meta;
    const at = doc.title.match(/@\s*(.+)$/)?.[1]?.trim(); // "Software Engineer @ Ramp"
    if (at) return at;
    return doc.location?.pathname.split("/")[1] ?? "";
  },
  hints: {
    root: (doc) => doc.querySelector(".ashby-application-form-container"),
    // The phone entry also holds the SMS/WhatsApp consent radios: split them out.
    containers: (root) =>
      [...root.querySelectorAll(ENTRY)].flatMap((entry) => {
        const consent = entry.querySelector(CONSENT);
        if (!consent) return [entry];
        const own = [...entry.querySelectorAll("input, textarea")].find((c) => !consent.contains(c));
        return [...(own ? [own] : []), ...consent.querySelectorAll("li")];
      }),
    keyFor(control, container) {
      const path = container.closest("[data-field-path]")?.getAttribute("data-field-path") ?? "";
      return PATHS[path] ?? PATHS[control.getAttribute("name") ?? ""];
    },
    questionText(container) {
      if (container.matches("li") && container.closest(CONSENT)) {
        const copy = container.cloneNode(true) as Element;
        copy.querySelectorAll("label").forEach((l) => l.remove());
        return `Consent to receive ${text(copy) || "text"} messages about your application`;
      }
      const entry = container.closest(ENTRY);
      return entry ? text(entry.querySelector(".ashby-application-form-question-title")).replace(/[*]/g, "").trim() || undefined : undefined;
    },
  },
});
