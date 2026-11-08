import { $, icon, badge, escapeHtml as esc, message, announce, emptyState } from "./ui.js";
import { normalized, dateValue } from "./records.js";
import { readAnimals, readApplications, readApplication, readProfile } from "./adopter-data.js";
import { renderProfile } from "./adopter-profile.js";

export const adopterPages = [
  { key: "available-animals", label: "Available animals", icon: "paw", description: "Find an animal you would like to welcome home." },
  { key: "my-applications", label: "My applications", icon: "clipboard", description: "Follow your applications and the shelter team's review." },
  { key: "my-details", label: "My details", icon: "people", description: "Keep your contact details ready for your next application." },
];

export function createAdopterPortal(client, onNavigate) {
  let active = null;
  let selectedId = null;
  let animals = [];
  let applications = [];
  let profile = null;
  const isCurrent = (context) => active === context;

  function canLeave() {
    if (active?.busy) { announce("Wait for the current request to finish."); return false; }
    return !active?.dirty || window.confirm("Discard your unsaved contact details?");
  }

  function openApplication(animalId) {
    return applications.find((entry) => entry.animal_id === animalId && !["rejected", "cancelled", "canceled"].includes(normalized(entry.application_status)));
  }

  function renderAnimals() {
    const query = $("animal-search").value.trim().toLowerCase();
    const visible = animals.filter((animal) => !query || [animal.animal_name, animal.breed_name, animal.species_name, animal.color, animal.sex].some((value) => String(value ?? "").toLowerCase().includes(query)));
    $("animal-count").textContent = `${visible.length} of ${animals.length} animals`;
    $("animal-grid").innerHTML = visible.length ? visible.map((animal) => {
      const submitted = openApplication(animal.animal_id);
      return `<article class="panel animal-card"><div class="animal-card-top"><span class="animal-symbol large">${icon("paw")}</span>${badge("Available")}</div><p class="eyebrow">${esc(animal.species_name)} <span aria-hidden="true">/</span> #${animal.animal_id}</p><h2>${esc(animal.animal_name)}</h2><p class="muted">${esc(animal.breed_name)}</p><dl class="animal-facts"><div><dt>Sex</dt><dd>${esc(animal.sex)}</dd></div><div><dt>Color</dt><dd>${esc(animal.color || "Not recorded")}</dd></div><div><dt>Birth date</dt><dd>${esc(dateValue(animal.birth_date) || "Not recorded")}</dd></div><div><dt>Arrival</dt><dd>${esc(dateValue(animal.arrival_date))}</dd></div></dl>${submitted ? `<a class="btn secondary block" href="?resource=my-applications" data-resource="my-applications">Application ${esc(submitted.application_status.toLowerCase())} ${icon("arrow")}</a>` : `<button class="btn primary block" type="button" data-apply="${animal.animal_id}" aria-label="Apply to adopt ${esc(animal.animal_name)} #${animal.animal_id}">Apply to adopt ${icon("arrow")}</button>`}</article>`;
    }).join("") : emptyState(query ? "No matching animals" : "No available animals right now", query ? "Try another name, breed, or species." : "Check back for newly available animals.", "paw");
    $("animal-grid").querySelectorAll("[data-apply]").forEach((button) => {
      button.onclick = () => {
        if (active?.busy) { announce("Wait for your application to finish submitting."); return; }
        selectedId = Number(button.dataset.apply);
        renderSelection(true);
      };
    });
  }

  function renderSelection(focus = false) {
    const animal = animals.find((item) => item.animal_id === selectedId);
    const panel = $("application-panel");
    if (!animal || openApplication(animal.animal_id)) { selectedId = null; panel.hidden = true; return; }
    panel.hidden = false;
    panel.innerHTML = `<div class="section-top"><div><span class="eyebrow">Your selected animal</span><h2 id="application-heading" tabindex="-1">Apply for ${esc(animal.animal_name)}</h2></div><button class="btn quiet" id="cancel-application" type="button">Close</button></div><div class="application-content">${profile ? `<p>Your application uses the contact details below.</p><dl class="detail-list application-contact"><div><dt>Name</dt><dd>${esc(profile.first_name)} ${esc(profile.last_name)}</dd></div><div><dt>Phone</dt><dd>${esc(profile.phone)}</dd></div><div><dt>Address</dt><dd>${esc(profile.address)}</dd></div></dl><p class="field-hint">Your application starts as Pending. The shelter team assigns a reviewer. Submitting an application does not reserve the animal.</p><p id="application-message" class="message" role="status" hidden></p><div class="form-actions"><a class="btn secondary" href="?resource=my-details" data-resource="my-details">Edit my details</a><button class="btn primary" id="btn-submit-application" type="button">Submit application</button></div><a class="application-link" href="?resource=my-applications" data-resource="my-applications">Check my applications</a>` : `<p>Save your contact details before submitting an application for ${esc(animal.animal_name)}.</p><a class="btn primary" href="?resource=my-details" data-resource="my-details">Add contact details ${icon("arrow")}</a>`}</div>`;
    $("cancel-application").onclick = () => {
      if (active?.busy) return;
      const id = selectedId;
      selectedId = null;
      panel.hidden = true;
      document.querySelector(`[data-apply="${id}"]`)?.focus();
    };
    if (profile) {
      $("btn-submit-application").onclick = submitApplication;
      $("btn-submit-application").disabled = active.uncertain;
      if (active.uncertain) message("application-message", "The previous response could not be confirmed. Check My applications before submitting again.", "error");
    }
    if (focus) $("application-heading").focus();
  }

  async function submitApplication() {
    const context = active;
    if (!context || context.busy || context.uncertain || !selectedId) return;
    const owner = client.session;
    context.busy = true;
    $("btn-submit-application").disabled = true;
    message("application-message", "Submitting your application...");
    try {
      const result = await client.request("adopter/applications", { method: "POST", body: { animal_id: selectedId } });
      if (!isCurrent(context) || owner !== client.session) return;
      context.uncertain = true;
      const saved = readApplication(result);
      selectedId = null;
      context.busy = false;
      await onNavigate("my-applications");
      if (owner === client.session) message("page-message", `Application #${saved.application_id} submitted for ${saved.animal_name}. Reload My applications for current status.`, "success");
    } catch (error) {
      if (!isCurrent(context) || owner !== client.session) return;
      context.uncertain ||= Boolean(error.uncertain);
      message("application-message", error.message + (context.uncertain ? " Check My applications before submitting again." : ""), "error");
    } finally {
      context.busy = false;
      if (isCurrent(context) && $("btn-submit-application")) $("btn-submit-application").disabled = context.uncertain;
    }
  }

  function renderApplications() {
    const content = applications.length ? `<div class="application-list">${applications.map((application) => `<article class="panel application-card"><div class="application-identity"><span class="animal-symbol">${icon("paw")}</span><div><p class="eyebrow">Application #${application.application_id}</p><h2>${esc(application.animal_name)}</h2><p class="muted">Submitted ${esc(dateValue(application.application_date))}</p></div></div><div class="application-progress">${badge(application.application_status)}<p>${application.reviewer_assigned ? "Reviewer assigned" : "Awaiting reviewer"}</p></div></article>`).join("")}</div>` : emptyState("No applications yet", "Choose an available animal to start your first application.", "clipboard") + '<a class="btn primary" href="?resource=available-animals" data-resource="available-animals">Browse available animals</a>';
    $("adopter-view").innerHTML = `<div class="portal-toolbar"><p class="muted">${applications.length} ${applications.length === 1 ? "application" : "applications"}</p><button class="btn secondary" type="button" id="portal-reload">Reload status</button></div>${content}`;
    $("portal-reload").onclick = () => onNavigate("my-applications");
  }

  async function show(key) {
    const context = { key, dirty: false, busy: false, uncertain: false };
    active = context;
    const owner = client.session;
    $("page-content").setAttribute("aria-busy", "true");
    $("adopter-view").innerHTML = '<div class="panel loading" role="status">Loading your adoption workspace...</div>';
    try {
      if (key === "available-animals") {
        const [animalData, applicationData, profileData] = await Promise.all([client.request("adopter/animals"), client.request("adopter/applications"), client.request("adopter/profile")]);
        if (!isCurrent(context) || owner !== client.session) return false;
        animals = readAnimals(animalData); applications = readApplications(applicationData); profile = readProfile(profileData);
        $("adopter-view").innerHTML = `<div class="portal-toolbar"><div class="search-field"><label class="sr-only" for="animal-search">Search available animals</label><span aria-hidden="true">${icon("search")}</span><input type="search" id="animal-search" placeholder="Name, breed, or species..."></div><div class="toolbar-end"><span id="animal-count" class="muted"></span><button class="btn secondary" id="portal-reload" type="button">Reload animals</button></div></div><section id="application-panel" class="panel selection-panel" aria-labelledby="application-heading" hidden></section><div id="animal-grid" class="animal-grid"></div>`;
        $("animal-search").oninput = renderAnimals;
        $("portal-reload").onclick = () => onNavigate("available-animals");
        renderAnimals();
        renderSelection();
      } else if (key === "my-applications") {
        const data = await client.request("adopter/applications");
        if (!isCurrent(context) || owner !== client.session) return false;
        applications = readApplications(data);
        renderApplications();
      } else {
        const data = await client.request("adopter/profile");
        if (!isCurrent(context) || owner !== client.session) return false;
        profile = readProfile(data);
        renderProfile(client, profile, context, isCurrent, async (saved) => {
          profile = saved;
          if (selectedId) await onNavigate("available-animals");
        });
      }
      announce("Adoption workspace loaded.");
      return true;
    } catch (error) {
      if (!isCurrent(context) || owner !== client.session) return false;
      $("adopter-view").innerHTML = `<div class="panel">${emptyState("Your records could not load", error.message)}<div class="empty"><button class="btn secondary" id="portal-reload" type="button">Retry loading</button></div></div>`;
      $("portal-reload").onclick = () => onNavigate(key);
      return false;
    } finally {
      if (isCurrent(context) && owner === client.session) $("page-content").setAttribute("aria-busy", "false");
    }
  }

  return {
    show, canLeave,
    clear() { active = null; selectedId = null; animals = []; applications = []; profile = null; $("adopter-view").replaceChildren(); },
    async resume() {
      if (active?.key === "my-details" && $("adopter-profile-form")) {
        message("profile-message", "Draft restored. Review your contact details, then save.");
        return;
      }
      if (active) await show(active.key);
    },
  };
}
