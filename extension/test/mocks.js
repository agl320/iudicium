// Stand-ins for the behaviour Workday's own scripts add to the saved pages:
// dropdowns that open a listbox, search prompts that return results, "Add"
// buttons that create entries, and "I currently work here" hiding the end date.
// Options come from data-mock-options="A|B|C" or the lists below.
(() => {
  const LISTS = {
    country: ["Australia", "Canada", "United States of America"],
    countryRegion: ["Alberta", "British Columbia", "Ontario", "Quebec"],
    phoneType: ["Landline", "Mobile"],
    degree: ["High School Diploma", "Bachelor's Degree", "Master's Degree", "Doctorate (PhD)"],
    countryPhoneCode: ["Australia (+61)", "Canada (+1)", "United States of America (+1)"],
    fieldOfStudy: ["Computer Engineering", "Computer Science", "Electrical Engineering"],
  };
  const optionsFor = (el) => {
    const own = el.getAttribute("data-mock-options");
    if (own) return own.split("|");
    const name = el.getAttribute("name") || (el.id || "").split("--").pop();
    return LISTS[name] || ["Option A", "Option B"];
  };

  const closeLists = () => document.querySelectorAll(".mock-listbox, .mock-results").forEach((x) => x.remove());

  // Dropdown: click the button → listbox of role="option"; click again or Escape → close.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.('button[aria-haspopup="listbox"]');
    if (!btn) return;
    const wasOpen = btn.getAttribute("aria-expanded") === "true";
    closeLists();
    document.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (wasOpen) return;
    btn.setAttribute("aria-expanded", "true");
    const ul = document.createElement("ul");
    ul.className = "mock-listbox";
    ul.setAttribute("role", "listbox");
    for (const t of optionsFor(btn)) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.textContent = t;
      li.addEventListener("click", () => {
        btn.textContent = t;
        btn.setAttribute("aria-expanded", "false");
        ul.remove();
      });
      ul.appendChild(li);
    }
    document.body.appendChild(ul);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeLists();
    document.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
  }, true);

  // Prompt: Enter in the search box → results; clicking one adds a pill.
  document.addEventListener("keydown", (e) => {
    const input = e.target;
    const container = input.closest?.('[data-automation-id="multiSelectContainer"]');
    if (e.key !== "Enter" || !container) return;
    closeLists();
    const q = input.value.toLowerCase().trim();
    const box = document.createElement("div");
    box.className = "mock-results";
    for (const full of optionsFor(input)) {
      const leaf = full.split(">").pop().trim();
      if (q && !full.toLowerCase().includes(q.split(" ")[0])) continue;
      const opt = document.createElement("div");
      opt.setAttribute("data-automation-id", "promptOption");
      opt.setAttribute("data-automation-label", leaf);
      opt.textContent = leaf;
      opt.addEventListener("click", () => {
        let ul = container.querySelector('[data-automation-id="selectedItemList"]');
        if (!ul) {
          ul = document.createElement("ul");
          ul.setAttribute("data-automation-id", "selectedItemList");
          container.appendChild(ul);
        }
        ul.insertAdjacentHTML("beforeend", `<li><div data-automation-id="selectedItem" aria-label="${leaf}"><p data-automation-id="promptOption" data-automation-label="${leaf}">${leaf}</p></div></li>`);
        input.value = "";
        box.remove();
      });
      box.appendChild(opt);
    }
    document.body.appendChild(box);
  }, true);

  document.addEventListener("click", (e) => {
    const del = e.target.closest?.('[data-automation-id="DELETE_charm"]');
    if (del) del.closest("li")?.remove();
  });

  // Add / Add Another: clone the section's first entry (registered on load) with fresh ids.
  const templates = new Map();
  for (const section of document.querySelectorAll('[role="group"][aria-labelledby$="-section"]')) {
    const panel = section.querySelector('[role="group"][aria-labelledby$="-panel"]');
    if (panel) templates.set(section, panel.outerHTML);
  }
  let uid = 900;
  document.addEventListener("click", (e) => {
    const add = e.target.closest?.('[data-automation-id="add-button"]');
    if (!add) return;
    const section = add.closest('[role="group"][aria-labelledby$="-section"]');
    const tpl = templates.get(section);
    if (!tpl) return;
    const name = section.getAttribute("aria-labelledby").replace(/-section$/, "");
    const n = section.querySelectorAll('[role="group"][aria-labelledby$="-panel"]').length + 1;
    const id = ++uid;
    const html = tpl
      .replace(/([A-Za-z]+)-\d+--/g, (_, p) => `${p}-${id}--`)
      .replace(new RegExp(`${name}-\\d+-panel`, "g"), `${name}-${n}-panel`)
      .replace(/ value="[^"]*"/g, ' value=""');
    setTimeout(() => {
      let anchor = add;
      while (anchor.parentElement && anchor.parentElement !== section) anchor = anchor.parentElement;
      anchor.insertAdjacentHTML("beforebegin", html);
      add.textContent = "Add Another";
    }, 120);
  });

  // "I currently work here" hides the end date, as on the live site.
  document.addEventListener("click", (e) => {
    const box = e.target.closest?.('[data-automation-id="formField-currentlyWorkHere"] input[type=checkbox]');
    if (!box) return;
    setTimeout(() => {
      const end = box.closest('[role="group"][aria-labelledby$="-panel"]')?.querySelector('[data-automation-id="formField-endDate"]');
      if (end) end.style.display = box.checked ? "none" : "";
    }, 50);
  });

  window.__mocksReady = true;
})();
