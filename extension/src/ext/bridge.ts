// Runs on the iudicium site (and localhost while developing) and connects it
// to the extension with window.postMessage:
//
//   site → extension  { iudicium: "site", id, type, payload }
//   extension → site  { iudicium: "ext",  id, ok, payload | error }
//   on load           { iudicium: "ext", type: "ready", payload: { version } }
//
// The site sends profiles built from its resumes (with the resume file to
// attach); the extension hands back the applications it has tracked. Only
// what the dashboard needs crosses over: learned answers stay in the extension.

import type { Profile } from "../core/profile";
import { load, saveProfiles, setActive } from "./storage";
import { loadApplications, saveApplications, type TrackedApplication } from "./track";

type Request = { iudicium: "site"; id: string; type: string; payload?: unknown };

const version = () => chrome.runtime.getManifest?.().version ?? "?";

function summary(p: Profile) {
  return {
    id: p.id,
    label: p.label,
    origin: p.origin,
    resumeFile: p.resumeFile ? { name: p.resumeFile.name, updated: p.resumeFile.updated } : undefined,
    experience: p.experience.length,
    education: p.education.length,
  };
}

async function handle(type: string, payload: unknown): Promise<unknown> {
  switch (type) {
    case "ping": {
      const store = await load();
      return { version: version(), activeProfileId: store.activeProfileId, profiles: store.profiles.map(summary) };
    }
    case "putProfile": {
      // Merge by id: what the site sends replaces those parts; anything only the
      // extension has (edited in options) is kept.
      const incoming = payload as Profile;
      if (!incoming?.id || !incoming.label || !incoming.person) throw new Error("profile needs id, label and person");
      const store = await load();
      const old = store.profiles.find((p) => p.id === incoming.id);
      const merged: Profile = old ? { ...old, ...incoming, work: { ...old.work, ...incoming.work }, screening: { ...old.screening, ...incoming.screening } } : incoming;
      // Drop the sample profile once a real one arrives.
      const rest = store.profiles.filter((p) => p.id !== incoming.id && p.id !== "sample");
      await saveProfiles([...rest, merged]);
      if (!old || store.activeProfileId === "sample") await setActive(merged.id);
      return summary(merged);
    }
    case "removeProfile": {
      const id = String(payload);
      const store = await load();
      const left = store.profiles.filter((p) => p.id !== id);
      await saveProfiles(left);
      return { removed: left.length < store.profiles.length };
    }
    case "setActive":
      await setActive(String(payload));
      return { ok: true };
    case "getApplications":
      return loadApplications();
    case "updateApplication": {
      const change = payload as Partial<TrackedApplication> & { id: string };
      const list = await loadApplications();
      const i = list.findIndex((a) => a.id === change.id);
      if (i < 0) throw new Error("no such application");
      list[i] = { ...list[i], ...change, updatedAt: new Date().toISOString() };
      await saveApplications(list);
      return list[i];
    }
    case "removeApplication": {
      const list = await loadApplications();
      await saveApplications(list.filter((a) => a.id !== String(payload)));
      return { ok: true };
    }
    default:
      throw new Error(`unknown request ${type}`);
  }
}

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const msg = e.data as Request;
  if (msg?.iudicium !== "site" || !msg.id || !msg.type) return;
  handle(msg.type, msg.payload).then(
    (payload) => window.postMessage({ iudicium: "ext", id: msg.id, ok: true, payload }, location.origin),
    (err) => window.postMessage({ iudicium: "ext", id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) }, location.origin),
  );
});

// Tell the page the extension is here (it may also ask with "ping").
window.postMessage({ iudicium: "ext", type: "ready", payload: { version: version() } }, location.origin);
// And when applications change (a fill or submit in another tab).
chrome.storage.onChanged.addListener((changes) => {
  if (changes.applications) window.postMessage({ iudicium: "ext", type: "applicationsChanged" }, location.origin);
  if (changes.profiles || changes.activeProfileId) window.postMessage({ iudicium: "ext", type: "profilesChanged" }, location.origin);
});
