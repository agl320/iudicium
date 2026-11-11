// Prototype storage in chrome.storage.local. Later: Supabase rows
// (application_profiles, saved_answers) with an offline copy kept here.

import { sampleProfile, type Profile, type SavedAnswer } from "../core/profile";

export type Store = {
  profiles: Profile[];
  activeProfileId: string;
  saved: Record<string, SavedAnswer[]>; // per profile id
};

export async function load(): Promise<Store> {
  const got = (await chrome.storage.local.get(["profiles", "activeProfileId", "saved"])) as Partial<Store>;
  const profiles = got.profiles?.length ? got.profiles : [sampleProfile()];
  const activeProfileId = profiles.some((p) => p.id === got.activeProfileId) ? got.activeProfileId! : profiles[0].id;
  return { profiles, activeProfileId, saved: got.saved ?? {} };
}

export async function saveProfiles(profiles: Profile[]) {
  await chrome.storage.local.set({ profiles });
}

export async function setActive(activeProfileId: string) {
  await chrome.storage.local.set({ activeProfileId });
}

export async function saveAnswers(profileId: string, list: SavedAnswer[]) {
  const { saved } = await load();
  await chrome.storage.local.set({ saved: { ...saved, [profileId]: list } });
}
