import { canWrite, getResource } from "./resources.js";
import { fieldValue, recordName, normalized, dateValue } from "./records.js";
import { $, escapeHtml as esc, icon, badge, emptyState } from "./ui.js";

export function renderTable(resource, rows, role, onOpen, onDelete) {
  const query = $("search").value.trim().toLowerCase();
  const filtered = rows.filter((row) => !query || JSON.stringify(row).toLowerCase().includes(query));
  $("record-count").textContent = `${rows.length} ${rows.length === 1 ? "record" : "records"}`;
  $("table-summary").textContent = `Showing ${filtered.length} of ${rows.length} records`;
  if (!filtered.length) {
    $("table-wrap").innerHTML = query
      ? emptyState("No matching records", "Clear your search or try another term.", "search") + '<div class="empty"><button id="clear-search" class="btn secondary" type="button">Clear search</button></div>'
      : emptyState(`No ${resource.label.toLowerCase()} yet`, canWrite(role, resource.key) ? `Add ${resource.singular === "animal" ? "an" : "a"} ${resource.singular} to get started.` : "No records are available to display.", resource.icon);
    if (query) $("clear-search").onclick = () => { $("search").value = ""; renderTable(resource, rows, role, onOpen, onDelete); $("search").focus(); };
    return;
  }
  const columns = resource.columns;
  const label = (name) => resource.fields.find((field) => field.name === name)?.label || name.replace(/_/g, " ");
  const cell = (row, name, index) => {
    const value = fieldValue(resource, row, name);
    if (name.includes("status") || name === "role") return badge(row[name]);
    if (index === 0) return `<div class="identity-cell">${resource.key === "animal" ? `<span class="animal-symbol">${icon("paw")}</span>` : ""}<span><strong>${esc(value)}</strong><small>#${row[resource.idKey]}</small></span></div>`;
    return esc(value);
  };
  $("table-wrap").innerHTML = `<table><caption class="sr-only">${esc(resource.label)}: ${filtered.length} records</caption><thead><tr>${columns.map((name) => `<th scope="col">${esc(label(name))}</th>`).join("")}<th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${filtered.map((row) => {
    const id = row[resource.idKey];
    const identity = esc(`${recordName(resource, row)} #${id}`);
    return `<tr>${columns.map((name, index) => `<td>${cell(row, name, index)}</td>`).join("")}<td><div class="row-actions"><button class="btn quiet" type="button" data-view="${id}" aria-label="View ${identity}">View</button>${canWrite(role, resource.key) ? `<button class="btn quiet" type="button" data-edit="${id}" aria-label="Edit ${identity}">Edit</button><button class="btn danger" type="button" data-delete="${id}" aria-label="Delete ${identity}">Delete</button>` : ""}</div></td></tr>`;
  }).join("")}</tbody></table>`;
  $("table-wrap").querySelectorAll("button").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.view || button.dataset.edit || button.dataset.delete;
      const row = rows.find((item) => String(item[resource.idKey]) === id);
      if (button.dataset.delete) onDelete(resource, row);
      else onOpen(resource, row, button.dataset.view ? "view" : "edit");
    };
  });
}

export function renderOverview(results, role) {
  const available = (key) => Array.isArray(results[key]);
  const timestamp = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
  const definitions = [
    { label: "Total animals", key: "animal", icon: "paw", count: (rows) => rows.length },
    { label: "Available animals", key: "animal", icon: "leaf", count: (rows) => rows.filter((row) => normalized(row.adoption_status) === "available").length },
    ...(role !== "volunteer" ? [
      { label: "Pending applications", key: "adoption-application", icon: "clipboard", count: (rows) => rows.filter((row) => normalized(row.application_status) === "pending").length },
      { label: "Adoption records", key: "adoption", icon: "home", count: (rows) => rows.length },
    ] : []),
  ];
  const stats = definitions.map((stat) => `<article class="panel stat-card"><div class="stat-top"><span>${stat.label}</span><span class="stat-icon">${icon(stat.icon)}</span></div><strong class="stat-value ${available(stat.key) ? "" : "unavailable"}">${available(stat.key) ? stat.count(results[stat.key]) : "Unavailable"}</strong><a href="?resource=${stat.key}" data-resource="${stat.key}">View records ${icon("arrow")}</a><small>${available(stat.key) ? `Updated ${esc(timestamp)}` : "Could not load. Retry below."}</small></article>`).join("");
  const animals = available("animal") ? [...results.animal].sort((a, b) => String(b.arrival_date).localeCompare(String(a.arrival_date))).slice(0, 5) : [];
  const arrivals = animals.length ? `<ul class="overview-list">${animals.map((animal) => `<li><span class="animal-symbol">${icon("paw")}</span><span class="list-identity"><strong>${esc(animal.animal_name)}</strong><small>#${animal.animal_id} <span aria-hidden="true">&middot;</span> Arrived ${esc(dateValue(animal.arrival_date) || "date unavailable")}</small></span>${badge(animal.adoption_status)}</li>`).join("")}</ul>` : emptyState(available("animal") ? "A fresh start" : "Animals are unavailable", available("animal") ? "New animal arrivals will appear here." : "Reload the overview to try again.", "paw");
  const actions = (role === "volunteer" ? [["animal", "View animals", "Get to know the animals in your care."]] : [["animal", "Add an animal", "Start a new animal record."], ["adoption-application", "Review applications", "Help the next chapter take shape."], ["medical-record", "Record medical care", "Keep each care history up to date."]]).map(([key, title, description]) => `<a class="quick-action" href="?resource=${key}" data-resource="${key}" ${title.startsWith("Add") || title.startsWith("Record") ? 'data-create="true"' : ""}>${icon(getResource(key).icon)}<span><strong>${title}</strong><small>${description}</small></span>${icon("arrow")}</a>`).join("");
  const failed = Object.values(results).some((value) => !Array.isArray(value));
  $("overview").innerHTML = `<div class="stats-grid">${stats}</div><div class="overview-grid"><section class="panel"><div class="section-top"><div><h2>Latest arrivals</h2><p>The newest faces in your shelter.</p></div><a href="?resource=animal" data-resource="animal">View all ${icon("arrow")}</a></div>${arrivals}</section><section class="panel"><div class="section-top"><div><h2>Make the next move</h2><p>A little progress makes a difference.</p></div></div><div class="quick-actions">${actions}</div></section></div><div class="panel overview-note"><div><strong>${failed ? "Some records could not load." : "Your shelter, at a glance."}</strong><p>${failed ? "Unavailable counts are not zero. Reload to try again." : "Counts reflect your latest fetched records."}</p></div><button id="btn-overview-reload" class="btn secondary" type="button">Reload overview</button></div>`;
}
