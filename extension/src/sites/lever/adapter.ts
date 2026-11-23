// Lever: jobs.lever.co/<org>/<id>/apply. Standard questions use input names
// (name, email, org, urls[LinkedIn]...); custom "cards" are radio/checkbox
// lists and selects inside li.application-question. Location is a text box
// with Lever's own result list that has to be clicked.

import type { CanonicalKey, FieldDriver } from "../../core/types";
import { companyFromMeta, formAdapter, FORM_DRIVERS } from "../form";
import { norm } from "../../core/match";
import { focusIn, focusOut, isVisible, realClick, setNativeValue, sleep, text, waitFor } from "../../dom/events";
import { asText } from "../../drivers/basic";

const NAMES: Record<string, CanonicalKey> = {
  name: "fullName",
  email: "email",
  phone: "phone",
  location: "location",
  org: "currentCompany",
  "urls[LinkedIn]": "linkedin",
  "urls[GitHub]": "github",
  "urls[Portfolio]": "website",
  "urls[Other]": "website",
};

const locationInput = (el: Element) => el.querySelector<HTMLInputElement>("input.location-input, input[name=location]");

/** Lever's location box: type, then click one of its .dropdown-location results. */
const leverLocation: FieldDriver = {
  name: "lever-location",
  detect: (el) => !!locationInput(el),
  kind: () => "text",
  read: (el) => locationInput(el)?.value || null,
  async write(el, answer) {
    const input = locationInput(el)!;
    const wants = [asText(answer.value), ...(answer.candidates ?? [])];
    const results = () => [...el.querySelectorAll(".dropdown-results > div, .dropdown-location")].filter(isVisible);
    for (const query of [...new Set([wants[0], wants[0].split(",")[0]])]) {
      focusIn(input);
      setNativeValue(input, query);
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true }));
      const got = await waitFor(() => (results().length ? results() : null), 4000);
      if (!got) continue;
      const pick = got.find((r) => wants.some((w) => norm(text(r)).startsWith(norm(w)))) ?? got.find((r) => norm(text(r)).startsWith(norm(query)));
      if (!pick) continue;
      realClick(pick);
      await sleep(200);
      focusOut(input);
      const hidden = el.querySelector<HTMLInputElement>("#selected-location, input[name=selectedLocation]");
      return { ok: !!input.value && (!hidden || !!hidden.value), shown: input.value };
    }
    // No result list (offline, or Lever changed it): leave the typed text.
    setNativeValue(input, wants[0]);
    focusOut(input);
    return { ok: true, shown: input.value, note: "typed; pick from Lever's list if it asks" };
  },
};

export const lever = formAdapter({
  name: "Lever",
  active: (doc) => !!doc.querySelector("form#application-form li.application-question"),
  company(doc) {
    const alt = doc.querySelector(".main-header-logo img")?.getAttribute("alt")?.replace(/\s*logo$/i, "").trim();
    if (alt) return alt;
    // Lever titles read "<Company> - <Job title>".
    const fromTitle = doc.title.split(/\s+[-–]\s+/);
    if (fromTitle.length > 1) return fromTitle[0].trim();
    return companyFromMeta(doc) || doc.location?.pathname.split("/")[1] || "";
  },
  hints: {
    root: (doc) => doc.querySelector("form#application-form"),
    containers: (root) => [...root.querySelectorAll("li.application-question, .application-additional")],
    keyFor: (control) => NAMES[control.getAttribute("name") ?? ""],
    questionText(container) {
      const label = container.querySelector(".application-label .text, .application-label");
      if (label) return text(label).replace(/[✱*]/g, "").trim();
      if (container.matches(".application-additional")) return "Additional information";
      return undefined;
    },
    drivers: [leverLocation, ...FORM_DRIVERS],
  },
});
