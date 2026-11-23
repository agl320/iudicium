// Prototype storage in chrome.storage.local. Later: Supabase rows
// (application_profiles, autofill_memory) with an offline copy kept here.

import { sampleProfile, type Profile } from "../core/profile";
import { emptyMemory, fromSaved, type Memory } from "../core/learn/memory";

export type Settings = { autoLearn: boolean };

export type Store = {
  profiles: Profile[];
  activeProfileId: string;
  memory: Record<string, Memory>; // per profile id
  settings: Settings;
};

type Raw = Partial<Store> & { saved?: Record<string, Parameters<typeof fromSaved>[0]> };

export async function load(): Promise<Store> {
  const got = (await chrome.storage.local.get(["profiles", "activeProfileId", "memory", "saved", "settings"])) as Raw;
  const profiles = got.profiles?.length ? got.profiles : [sampleProfile()];
  const activeProfileId = profiles.some((p) => p.id === got.activeProfileId) ? got.activeProfileId! : profiles[0].id;
  const memory = got.memory ?? {};
  // First prototype stored exact-match "saved answers": convert once.
  if (got.saved && !got.memory) {
    for (const [id, list] of Object.entries(got.saved)) memory[id] = fromSaved(list);
    await chrome.storage.local.set({ memory });
    await chrome.storage.local.remove("saved");
  }
  return { profiles, activeProfileId, memory, settings: { autoLearn: true, ...got.settings } };
}

export const memoryOf = (store: Store, profileId: string): Memory => store.memory[profileId] ?? emptyMemory();

export async function saveProfiles(profiles: Profile[]) {
  await chrome.storage.local.set({ profiles });
}

export async function setActive(activeProfileId: string) {
  await chrome.storage.local.set({ activeProfileId });
}

export async function saveMemory(profileId: string, mem: Memory) {
  const { memory } = await load();
  await chrome.storage.local.set({ memory: { ...memory, [profileId]: mem } });
}

export async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ settings });
}
