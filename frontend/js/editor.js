import { canWrite, getResource } from "./resources.js";
import { buildPayload, dateValue, fieldValue, readRows, recordName, isFinal } from "./records.js";
import { loadReferences, populateReferences } from "./references.js";
import { $, escapeHtml as esc, icon, message, announce, badge } from "./ui.js";

export function fieldMarkup(field, row) {
  const required = field.required || (field.createRequired && !row);
  const value = field.type === "password" ? "" : field.type === "date" ? dateValue(row?.[field.name]) : row?.[field.name] ?? (!row ? field.defaultValue : "") ?? "";
  const attrs = `id="f-${field.name}" name="${field.name}" ${required ? "required" : ""} aria-describedby="hint-${field.name} error-${field.name}" ${field.maxLength ? `maxlength="${field.maxLength}"` : ""}`;
  let control;
  if (field.ref) control = `<select ${attrs} disabled><option value="">Loading choices...</option></select>`;
  else if (field.type === "select") {
    const choices = [...new Set([...(field.options || []), ...(value ? [value] : [])])];
    control = `<select ${attrs}><option value="">Choose ${esc(field.label.toLowerCase())}</option>${choices.map((choice) => `<option value="${esc(choice)}" ${choice === value ? "selected" : ""}>${esc(choice)}</option>`).join("")}</select>`;
  } else if (field.type === "textarea") control = `<textarea ${attrs} rows="3">${esc(value)}</textarea>`;
  else control = `<input ${attrs} type="${field.type}" value="${esc(value)}" ${field.type === "password" ? 'autocomplete="new-password"' : field.name === "username" ? 'autocomplete="username" autocapitalize="none"' : ""}>`;
  return `<div class="field"><label for="f-${field.name}">${esc(field.label)} <span>${required ? "(required)" : "(optional)"}</span></label>${control}<small id="hint-${field.name}" ${!field.hint ? "hidden" : ""}>${esc(field.hint || "")}</small><span class="field-error" id="error-${field.name}" hidden></span></div>`;
}

export function createEditor(client, { onSaved, onReload, onDelete }) {
  let context = null;
  let opener = null;
  const panel = $("form-panel");

  function close(restoreFocus = true) {
    context = null;
    panel.hidden = true;
    panel.replaceChildren();
    if (restoreFocus) (opener?.isConnected ? opener : $("btn-add")).focus();
  }
  function canLeave() {
    if (context?.busy) { announce("Wait for the current save to finish."); return false; }
    return !context?.dirty || window.confirm("Discard your unsaved changes?");
  }
  function heading(title, subtitle) {
    return `<div class="editor-heading"><div><span class="eyebrow">${esc(subtitle)}</span><h2 id="form-title" tabindex="-1">${esc(title)}</h2></div><button id="btn-close-editor" type="button" class="btn quiet icon-button" aria-label="Close record panel">${icon("close")}</button></div>`;
  }
  function wireClose() {
    $("btn-close-editor").onclick = () => { if (canLeave()) close(); };
  }
  function showErrors(errors) {
    for (const field of context.resource.fields) {
      const error = errors[field.name];
      const input = $("f-" + field.name);
      input.setAttribute("aria-invalid", error ? "true" : "false");
      $("error-" + field.name).textContent = error || "";
      $("error-" + field.name).hidden = !error;
    }
    const summary = $("form-message");
    summary.hidden = !Object.keys(errors).length;
    summary.className = "message error form-summary";
    summary.innerHTML = `<strong>Check these fields:</strong><ul>${Object.entries(errors).map(([name, error]) => `<li><a href="#f-${name}">${esc(error)}</a></li>`).join("")}</ul>`;
    if (!summary.hidden) summary.focus();
  }

  async function refreshReferences(active) {
    if (!active.resource.fields.some((field) => field.ref)) return;
    $("btn-save").disabled = true;
    message("reference-message", "Loading relationship choices...");
    try {
      const references = await loadReferences(client, active.resource);
      if (context !== active) return;
      active.references = references;
      const missing = populateReferences(active.resource, active.row, references, $("record-form"));
      message("reference-message", "");
      $("btn-save").disabled = active.uncertain || missing.length > 0;
      if (missing.length) {
        $("reference-message").hidden = false;
        $("reference-message").innerHTML = missing.map((field) => {
          const target = getResource(field.ref);
          const action = canWrite(client.session?.role, target.key) && target.key !== active.resource.key
            ? `<a href="?resource=${target.key}" data-resource="${target.key}">Open ${esc(target.label.toLowerCase())}</a>.`
            : "Ask an administrator to add the required record.";
          return `<p>No eligible ${esc(field.label.toLowerCase())} choices. ${action}</p>`;
        }).join("");
      }
    } catch (error) {
      if (context !== active || error.status === 401) return;
      message("reference-message", "Cannot load relationship choices. " + error.message, "error");
      const button = document.createElement("button");
      button.className = "btn secondary";
      button.type = "button";
      button.textContent = "Retry choices";
      button.onclick = () => refreshReferences(active);
      $("reference-message").append(button);
    }
  }

  async function save(event) {
    event.preventDefault();
    const active = context;
    if (!active || active.busy || active.uncertain || $("btn-save").disabled) return;
    const { resource, row } = active;
    const values = Object.fromEntries(resource.fields.map((field) => [field.name, $("f-" + field.name).value]));
    const { body, errors } = buildPayload(resource, values, row);
    for (const field of resource.fields.filter((entry) => entry.ref)) {
      if ($("f-" + field.name).selectedOptions[0]?.dataset.missing) errors[field.name] = `${field.label} is unavailable. Choose an existing record.`;
    }
    if (resource.key === "adoption") {
      const application = active.references["adoption-application"]?.find((item) => item.application_id === body.application_id);
      if (!application || application.animal_id !== body.animal_id || application.adopter_id !== body.adopter_id) errors.application_id = "Choose an application with a matching animal and adopter.";
    }
    showErrors(errors);
    if (Object.keys(errors).length) return;
    if (resource.key === "adoption-application" && isFinal(body.application_status) && !window.confirm("This marks the animal adopted and rejects other open applications. It does not create an adoption record. Continue?")) return;
    active.busy = true;
    $("form-fields").disabled = true;
    $("btn-save").disabled = true;
    $("btn-save").textContent = "Saving...";
    message("form-message", "Saving your changes...");
    let accepted = false;
    try {
      const path = row ? `${resource.path}/${row[resource.idKey]}` : resource.createPath || resource.path;
      const result = await client.request(path, { method: row ? "PUT" : "POST", body, auth: !(!row && resource.createPath) });
      accepted = true;
      active.dirty = false;
      const saved = readRows(resource, [result])[0];
      close(false);
      await onSaved(resource, saved, !row);
    } catch (error) {
      if (context !== active || error.status === 401) return;
      message("form-message", error.message, "error");
      $("form-message").focus();
      if (error.uncertain || accepted) {
        active.uncertain = true;
        const check = document.createElement("button");
        check.type = "button"; check.className = "btn secondary"; check.textContent = "Reload records to check";
        check.onclick = async () => {
          check.disabled = true;
          const loaded = await onReload();
          if (context !== active) return;
          if (loaded) { active.uncertain = false; $("btn-save").disabled = false; message("form-message", "Records reloaded. Check whether your change already exists before submitting again."); }
          else check.disabled = false;
        };
        $("form-message").append(check);
      }
    } finally {
      active.busy = false;
      if (context === active) {
        $("form-fields").disabled = false;
        $("btn-save").disabled = active.uncertain;
        $("btn-save").textContent = "Save changes";
      }
    }
  }

  function open(resource, row = null, mode = "edit") {
    if (!canLeave()) return;
    opener = document.activeElement;
    const writable = canWrite(client.session?.role, resource.key);
    if (!writable) mode = "view";
    context = { resource, row, mode, dirty: false, busy: false, uncertain: false, references: {} };
    panel.hidden = false;
    if (mode === "view" && row) {
      const names = [...new Set([resource.idKey, ...resource.fields.filter((field) => field.type !== "password").map((field) => field.name), ...resource.columns])];
      panel.innerHTML = heading(recordName(resource, row), `${resource.singular} #${row[resource.idKey]}`)
        + `<dl class="detail-list">${names.map((name) => `<div><dt>${esc(resource.fields.find((field) => field.name === name)?.label || name.replace(/_/g, " "))}</dt><dd>${name.includes("status") || name === "role" ? badge(row[name]) : esc(fieldValue(resource, row, name))}</dd></div>`).join("")}</dl>`
        + (writable ? '<div class="form-actions"><button id="btn-detail-edit" class="btn primary" type="button">Edit record</button><button id="btn-detail-delete" class="btn danger" type="button">Delete</button></div>' : "");
      if (writable) {
        $("btn-detail-edit").onclick = () => open(resource, row);
        $("btn-detail-delete").onclick = () => onDelete(resource, row);
      }
      wireClose(); $("form-title").focus(); return;
    }
    panel.innerHTML = heading(row ? `Edit ${resource.singular}` : `Add ${resource.singular}`, row ? `Record #${row[resource.idKey]}` : "New record")
      + `<form id="record-form" novalidate><div id="form-message" class="message form-summary" tabindex="-1" role="alert" hidden></div><div id="reference-message" class="message" role="status" hidden></div>`
      + (resource.key === "users" ? `<p class="field-hint form-summary">Role: ${esc(row?.role || "user (adopter)")}. Role changes require administrator provisioning outside this interface.</p>` : "")
      + (resource.key === "adoption" ? '<p class="field-hint form-summary">Choose a nonfinal application. Its animal and adopter are filled in for you. Save the adoption before marking the application adopted.</p>' : "")
      + `<fieldset id="form-fields" class="form-fields"><legend class="sr-only">${esc(resource.label)} fields</legend>${resource.fields.map((field) => fieldMarkup(field, row)).join("")}</fieldset><div class="form-actions"><button id="btn-cancel" class="btn secondary" type="button">Cancel</button><button id="btn-save" class="btn primary" type="submit">Save changes</button></div></form>`;
    wireClose();
    $("btn-cancel").onclick = () => { if (canLeave()) close(); };
    $("record-form").oninput = () => { context.dirty = true; };
    $("record-form").onchange = () => { context.dirty = true; };
    $("record-form").onsubmit = save;
    refreshReferences(context);
    (panel.querySelector("input:not(:disabled), select:not(:disabled), textarea") || $("form-title")).focus();
  }

  return {
    open, close, canLeave,
    get busy() { return Boolean(context?.busy); },
    get hasDraft() { return context?.mode === "edit"; },
    clearPasswords() { panel.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ""; }); },
    resume() {
      if (context?.mode !== "edit") return;
      message("form-message", "Draft restored. Review your fields, then save to continue.");
      refreshReferences(context);
    },
  };
}
