import { sampleProfile, type Profile } from "../core/profile";
import { load, saveAnswers, saveProfiles, setActive } from "../ext/storage";

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
  editor.value = JSON.stringify(active, null, 2);

  const tbody = $<HTMLTableSectionElement>("saved");
  tbody.innerHTML = "";
  const saved = store.saved[active.id] ?? [];
  if (!saved.length) tbody.innerHTML = `<tr><td colspan="4" class="note">None yet.</td></tr>`;
  saved.forEach((s, i) => {
    const tr = document.createElement("tr");
    for (const t of [s.question, Array.isArray(s.value) ? s.value.join(", ") : String(s.value), s.company ?? "all employers"]) {
      const td = document.createElement("td");
      td.textContent = t;
      tr.append(td);
    }
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.textContent = "Forget";
    del.onclick = async () => {
      await saveAnswers(active.id, saved.filter((_, k) => k !== i));
      await render();
    };
    td.append(del);
    tr.append(td);
    tbody.append(tr);
  });
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
  profiles[i] = p;
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
  if (!confirm("Delete this profile and its saved answers?")) return;
  await saveProfiles(store.profiles.filter((p) => p.id !== store.activeProfileId));
  await saveAnswers(store.activeProfileId, []);
  await render();
};

void render();
