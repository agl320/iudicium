// Greenhouse: job-boards.greenhouse.io (React board, also used by the embed
// iframe on company career sites) and the older boards.greenhouse.io form
// (#application_form). Fields sit in .field-wrapper; dropdowns are React
// Select comboboxes; demographic questions use the same widgets.

import type { CanonicalKey } from "../../core/types";
import { companyFromMeta, formAdapter } from "../form";
import { text } from "../../dom/events";

const IDS: Record<string, CanonicalKey> = {
  first_name: "firstName",
  last_name: "lastName",
  preferred_name: "preferredFirstName",
  email: "email",
  phone: "phone",
  "candidate-location": "location",
  school: "school",
  degree: "degree",
  discipline: "fieldOfStudy",
  job_application_location: "location",
};

const form = (doc: Document) => doc.querySelector("form#application-form, form#application_form, #application_form form, #application_form");

export const greenhouse = formAdapter({
  name: "Greenhouse",
  active: (doc) => !!doc.querySelector("form#application-form.application--form, #application_form, form#application_form"),
  company(doc) {
    const legacy = text(doc.querySelector(".company-name")).replace(/^at\s+/i, "");
    if (legacy) return legacy;
    const fromMeta = companyFromMeta(doc);
    if (fromMeta) return fromMeta;
    // job-boards.greenhouse.io/<board>/jobs/<id>, or /embed/job_app?for=<board>
    const board = doc.location?.pathname.split("/")[1] ?? "";
    return new URLSearchParams(doc.location?.search ?? "").get("for") || (board !== "embed" ? board : "");
  },
  hints: {
    root: form,
    containers: (root) => [...root.querySelectorAll(".field-wrapper, .file-upload, #resume_fieldset, #cover_letter_fieldset")],
    keyFor(control) {
      const id = control.id || control.getAttribute("name") || "";
      if (id === "country" && control.closest(".phone-input")) return "phoneCountryCode";
      // Education rows: school--0, degree--0, discipline--0
      return IDS[id] ?? IDS[id.replace(/--\d+$/, "")] ?? IDS[id.replace(/^job_application\[|\]$/g, "")];
    },
  },
});
