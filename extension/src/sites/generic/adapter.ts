// Any other site: the page's largest form, scanned generically. Only active
// when the form looks like an application (name + email, or a resume upload),
// so login and newsletter forms are left alone.

import { companyFromMeta, formAdapter, looksLikeApplication } from "../form";

export const generic = formAdapter({
  name: "Generic form",
  active: looksLikeApplication,
  company: (doc) => companyFromMeta(doc) || (doc.location?.hostname ?? "").replace(/^(www|jobs|careers|apply)\./, "").split(".")[0],
  hints: {},
});
