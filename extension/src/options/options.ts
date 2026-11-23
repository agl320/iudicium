import { sampleProfile, type Profile } from "../core/profile";
import { load, memoryOf, saveMemory, saveProfiles, setActive } from "../ext/storage";
import type { Memory } from "../core/learn/memory";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = $<HTMLSelectElement>("profiles");
const editor = $<HTMLTextAreaElement>("json");
const status = $<HTMLSpanElement>("status");

function say(message: string, error = false) {
  status.textContent = message;
  status.className = error ? "status error" : "status";
}

async function render() {
  const store = await load();
  picker.innerHTML = "";
  for (const p of store.profiles) picker.add(new Option(p.label, p.id, false, p.id === store.activeProfileId));
  const active = store.profiles.find((p) => p.id === store.activeProfileId)!;
  // The resume file is shown separately (base64 is unreadable in the editor).
  const { resumeFile, coverLetterFile, ...rest } = active;
  editor.value = JSON.stringify(rest, null, 2);
  $("resume-name").textContent = resumeFile ? `${resumeFile.name} (${Math.round((resumeFile.data.length * 3) / 4 / 1024)} KB)` : "none";
  void coverLetterFile;

  renderMemory(active.id, memoryOf(store, active.id));
}

function cell(tr: HTMLTableRowElement, content: string | Node) {
  const td = document.createElement("td");
  td.append(content);
  tr.append(td);
  return td;
}

function forget(onclick: () => Promise<void>) {
  const b = document.createElement("button");
  b.textContent = "Forget";
  b.onclick = async () => {
    await onclick();
    await render();
  };
  return b;
}

function renderMemory(profileId: string, mem: Memory) {
  const tbody = $<HTMLTableSectionElement>("saved");
  tbody.replaceChildren();
  const concepts = [...mem.concepts].sort((a, b) => b.stats.updated.localeCompare(a.stats.updated));
  if (!concepts.length) tbody.innerHTML = `<tr><td colspan="5" class="note">Nothing learned yet.</td></tr>`;
  for (const c of concepts) {
    const tr = document.createElement("tr");
    const q = document.createElement("div");
    q.textContent = c.variants[c.variants.length - 1]?.text ?? "";
    const td = cell(tr, q);
    if (c.variants.length > 1) {
      const more = document.createElement("div");
      more.className = "variants";
      more.textContent = `+${c.variants.length - 1} other wording${c.variants.length > 2 ? "s" : ""}: ${c.variants
        .slice(0, -1)
        .map((v) => `“${v.text}”`)
        .join(", ")}`;
      td.append(more);
    }
    const answer = typeof c.answer === "boolean" ? (c.answer ? "Yes" : "No") : Array.isArray(c.answer) ? c.answer.join(", ") : c.answer;
    cell(tr, answer.length > 160 ? answer.slice(0, 159) + "…" : answer);
    cell(tr, c.company ? `only ${c.company}` : "all employers");
    cell(tr, `${c.stats.used} · ${c.stats.confirmed} · ${c.stats.corrected}`);
    cell(tr, forget(() => saveMemory(profileId, { ...mem, concepts: mem.concepts.filter((x) => x.id !== c.id) })));
    tbody.append(tr);
  }

  const skills = $<HTMLTableSectionElement>("skills");
  skills.replaceChildren();
  const entries = Object.entries(mem.skills).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) skills.innerHTML = `<tr><td colspan="3" class="note">None yet.</td></tr>`;
  for (const [skill, has] of entries) {
    const tr = document.createElement("tr");
    cell(tr, skill);
    cell(tr, has ? "Yes" : "No");
    cell(
      tr,
      forget(() => {
        const rest = { ...mem.skills };
        delete rest[skill];
        return saveMemory(profileId, { ...mem, skills: rest });
      }),
    );
    skills.append(tr);
  }
}

function parse(): Profile | null {
  try {
    const p = JSON.parse(editor.value) as Profile;
    if (!p.id || !p.label || !p.person) throw new Error("needs id, label and person");
    return p;
  } catch (e) {
    say(`Not saved: ${e instanceof Error ? e.message : e}`, true);
    return null;
  }
}

picker.onchange = async () => {
  await setActive(picker.value);
  await render();
};

$("save").onclick = async () => {
  const p = parse();
  if (!p) return;
  const store = await load();
  const i = store.profiles.findIndex((x) => x.id === store.activeProfileId);
  const profiles = [...store.profiles];
  const old = profiles[i];
  profiles[i] = { ...p, resumeFile: p.resumeFile ?? old.resumeFile, coverLetterFile: p.coverLetterFile ?? old.coverLetterFile };
  await saveProfiles(profiles);
  await setActive(p.id);
  say("Saved.");
  await render();
};

async function add(profile: Profile) {
  const store = await load();
  await saveProfiles([...store.profiles, profile]);
  await setActive(profile.id);
  await render();
}

const newId = () => Math.random().toString(36).slice(2, 10);

$("new").onclick = () => add({ ...sampleProfile(), id: newId(), label: "New profile" });
$("duplicate").onclick = () => {
  const p = parse();
  if (p) void add({ ...structuredClone(p), id: newId(), label: `${p.label} (copy)` });
};
$("delete").onclick = async () => {
  const store = await load();
  if (store.profiles.length <= 1) return say("Keep at least one profile.", true);
  if (!confirm("Delete this profile and what it has learned?")) return;
  await saveProfiles(store.profiles.filter((p) => p.id !== store.activeProfileId));
  const { memory } = store;
  delete memory[store.activeProfileId];
  await chrome.storage.local.set({ memory });
  await render();
};

async function updateActive(change: (p: Profile) => Profile) {
  const store = await load();
  await saveProfiles(store.profiles.map((x) => (x.id === store.activeProfileId ? change(x) : x)));
  await render();
}

$<HTMLInputElement>("resume-file").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 3_000_000) return say("Keep the resume under 3 MB.", true);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await updateActive((p) => ({ ...p, resumeFile: { name: file.name, type: file.type || "application/octet-stream", data: btoa(bin), updated: new Date().toISOString() } }));
  say(`Attached ${file.name}.`);
};
$("resume-clear").onclick = () => updateActive((p) => ({ ...p, resumeFile: undefined }));

void render();
