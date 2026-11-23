// Talks to the iudicium autofill extension through window.postMessage (its
// bridge content script runs on this site). Without the extension every
// request fails fast and the page says how to install it.

import { useCallback, useEffect, useState } from "react";
import type { AutofillProfile } from "./profile";

export type ApplicationStatus = "started" | "submitted" | "interview" | "offer" | "rejected" | "withdrawn";

/** As recorded by the extension (src/ext/track.ts there). */
export type TrackedApplication = {
  id: string;
  url: string;
  company: string;
  title: string;
  site: string;
  profileId: string;
  profileLabel: string;
  resumeId?: string;
  resumeTitle?: string;
  resumeFile?: string;
  status: ApplicationStatus;
  startedAt: string;
  submittedAt?: string;
  updatedAt: string;
  filled?: number;
  needs?: number;
};

export type ExtensionProfile = {
  id: string;
  label: string;
  origin?: { resumeId?: string; resumeTitle?: string; syncedAt: string };
  resumeFile?: { name: string; updated?: string };
  experience: number;
  education: number;
};

type Reply = { iudicium: "ext"; id?: string; type?: string; ok?: boolean; payload?: unknown; error?: string };

let seq = 0;

export function request<T>(type: string, payload?: unknown, timeout = 1500): Promise<T> {
  const id = `r${Date.now()}-${seq++}`;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The extension did not answer."));
    }, timeout);
    function onMessage(e: MessageEvent) {
      const msg = e.data as Reply;
      if (e.source !== window || msg?.iudicium !== "ext" || msg.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (msg.ok) resolve(msg.payload as T);
      else reject(new Error(msg.error ?? "The extension refused the request."));
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ iudicium: "site", id, type, payload }, window.location.origin);
  });
}

export type ExtensionState = {
  status: "checking" | "missing" | "ready";
  version?: string;
  activeProfileId?: string;
  profiles: ExtensionProfile[];
  applications: TrackedApplication[];
};

async function fetchState(): Promise<ExtensionState> {
  try {
    const info = await request<{ version: string; activeProfileId: string; profiles: ExtensionProfile[] }>("ping");
    const applications = await request<TrackedApplication[]>("getApplications");
    return { status: "ready", version: info.version, activeProfileId: info.activeProfileId, profiles: info.profiles, applications };
  } catch {
    return { status: "missing", profiles: [], applications: [] };
  }
}

/** Live view of the extension: profiles it holds and applications it tracked. */
export function useExtension() {
  const [state, setState] = useState<ExtensionState>({ status: "checking", profiles: [], applications: [] });

  const refresh = useCallback(() => fetchState().then(setState), []);

  useEffect(() => {
    let live = true;
    const update = () => void fetchState().then((s) => live && setState(s));
    update();
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as Reply;
      if (e.source === window && msg?.iudicium === "ext" && msg.type) update();
    };
    window.addEventListener("message", onMessage);
    return () => {
      live = false;
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const sendProfile = useCallback(
    async (profile: AutofillProfile) => {
      await request("putProfile", profile, 5000);
      await refresh();
    },
    [refresh],
  );

  const updateApplication = useCallback(
    async (change: Partial<TrackedApplication> & { id: string }) => {
      await request("updateApplication", change);
      await refresh();
    },
    [refresh],
  );

  const removeApplication = useCallback(
    async (id: string) => {
      await request("removeApplication", id);
      await refresh();
    },
    [refresh],
  );

  return { ...state, refresh, sendProfile, updateApplication, removeApplication };
}
