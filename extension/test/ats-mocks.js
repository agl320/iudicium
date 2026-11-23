// Stand-ins for what each ATS's own scripts do, on the saved (script-free)
// forms: React Select menus (Greenhouse), Yes/No toggles and the location
// combobox (Ashby), Lever's location results. Options come from
// data-mock-options="A|B|C" on the input, else the lists below.
(() => {
  const LISTS = {
    gender: ["Male", "Female", "Decline To Self Identify"],
    hispanic_ethnicity: ["Yes", "No", "Decline To Self Identify"],
    veteran_status: ["I am not a protected veteran", "I identify as one or more of the classifications of a protected veteran", "I don't wish to answer"],
    disability_status: ["Yes, I have a disability, or have had one in the past", "No, I do not have a disability and have not had one in the past", "I do not want to answer"],
    country: ["Australia", "Canada", "United Kingdom", "United States"],
  };
  const PLACES = ["Vancouver, British Columbia, Canada", "Vancouver, Washington, United States", "Toronto, Ontario, Canada", "Burnaby, British Columbia, Canada"];
  const optionsFor = (input) => {
    const own = input.getAttribute("data-mock-options");
    if (own) return own.split("|");
    if (LISTS[input.id]) return LISTS[input.id];
    const label = document.getElementById(`${input.id}-label`)?.textContent ?? "";
    return /country/i.test(label) ? LISTS.country : ["Yes", "No"];
  };
  const visible = (e) => e && e.getClientRects().length > 0;

  // --- React Select (Greenhouse): .select-shell > .select__control > input.select__input
  function shell(input) {
    return input.closest(".select-shell") || input.closest("[class*=container]");
  }
  function closeMenus() {
    document.querySelectorAll(".mock-menu").forEach((m) => m.remove());
    document.querySelectorAll('input.select__input[aria-expanded="true"]').forEach((i) => i.setAttribute("aria-expanded", "false"));
  }
  function openMenu(input, filter = "") {
    closeMenus();
    const s = shell(input);
    const menu = document.createElement("div");
    menu.className = "select__menu mock-menu";
    const list = document.createElement("div");
    list.className = "select__menu-list";
    list.setAttribute("role", "listbox");
    list.id = `react-select-${input.id}-listbox`;
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "true");
    const opts = optionsFor(input).filter((o) => o.toLowerCase().includes(filter.toLowerCase()));
    if (!opts.length) list.innerHTML = '<div class="select__menu-notice--no-options">No options</div>';
    for (const t of opts) {
      const o = document.createElement("div");
      o.className = "select__option";
      o.setAttribute("role", "option");
      o.textContent = t;
      o.addEventListener("click", () => {
        let v = s.querySelector(".select__single-value");
        if (!v) {
          v = document.createElement("div");
          v.className = "select__single-value";
          s.querySelector(".select__value-container").prepend(v);
        }
        v.textContent = t;
        const ph = s.querySelector(".select__placeholder");
        if (ph) ph.remove();
        input.value = "";
        closeMenus();
      });
      list.append(o);
    }
    menu.append(list);
    s.append(menu);
  }
  document.addEventListener("mousedown", (e) => {
    const input = e.target.closest?.(".select__control")?.querySelector("input.select__input");
    if (input) {
      if (input.getAttribute("aria-expanded") === "true") closeMenus();
      else openMenu(input, input.value);
      return;
    }
    if (!e.target.closest?.(".mock-menu")) closeMenus();
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches?.("input.select__input")) openMenu(t, t.value);
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (!t.matches?.("input.select__input, input[role=combobox]")) return;
    if (e.key === "Escape") {
      closeMenus();
      closeAshby();
    }
    if (e.key === "ArrowDown" && t.matches("input.select__input")) openMenu(t, t.value);
  });

  // --- Ashby: yes/no buttons and the location combobox ---------------------------------
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.(".ashby-application-form-input-yesno-option");
    if (!b) return;
    for (const other of b.parentElement.querySelectorAll("button")) {
      other.setAttribute("aria-pressed", String(other === b));
      other.classList.toggle("_active_mock", other === b);
    }
    e.preventDefault();
  });
  function closeAshby() {
    document.querySelectorAll(".mock-ashby-list").forEach((m) => m.remove());
  }
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.matches?.(".ashby-application-form-input-autocomplete")) return;
    closeAshby();
    if (!t.value) return;
    const ul = document.createElement("div");
    ul.className = "mock-ashby-list";
    ul.setAttribute("role", "listbox");
    ul.id = "ashby-location-listbox";
    t.setAttribute("aria-controls", ul.id);
    // Results arrive a little later, like a server search.
    setTimeout(() => {
      for (const p of PLACES.filter((x) => x.toLowerCase().startsWith(t.value.toLowerCase().split(",")[0]))) {
        const o = document.createElement("div");
        o.setAttribute("role", "option");
        o.textContent = p;
        o.addEventListener("click", () => {
          t.value = p;
          closeAshby();
        });
        ul.append(o);
      }
      t.parentElement.append(ul);
    }, 200);
  });

  // --- Lever: location results under .dropdown-results --------------------------------
  document.addEventListener("keyup", (e) => {
    const t = e.target;
    if (!t.matches?.("input.location-input")) return;
    const box = t.closest(".application-field").querySelector(".dropdown-results");
    const container = box.parentElement;
    box.innerHTML = "";
    container.style.display = "block";
    setTimeout(() => {
      for (const p of PLACES.filter((x) => x.toLowerCase().startsWith(t.value.toLowerCase().split(",")[0]))) {
        const d = document.createElement("div");
        d.className = "dropdown-location";
        d.textContent = p;
        d.addEventListener("click", () => {
          t.value = p;
          document.getElementById("selected-location").value = JSON.stringify({ name: p });
          box.innerHTML = "";
        });
        box.append(d);
      }
    }, 150);
  });
  window.__mockVisible = visible;
})();
