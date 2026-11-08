import { getResource } from "./resources.js";
import { buildPayload } from "./records.js";
import { fieldMarkup } from "./editor.js";
import { readProfile } from "./adopter-data.js";
import { $, escapeHtml as esc, message, announce } from "./ui.js";

export function renderProfile(client, profile, context, isCurrent, onSaved) {
  const resource = getResource("adopter");
  $("adopter-view").innerHTML = `<section class="panel profile-panel" aria-labelledby="profile-title"><div class="section-top"><div><h2 id="profile-title">Your contact details</h2><p>Your shelter team uses these details to review your applications.</p></div></div><form id="adopter-profile-form" novalidate><div id="profile-message" class="message form-summary" role="alert" tabindex="-1" hidden></div><fieldset id="profile-fields" class="form-fields"><legend class="sr-only">Adopter contact details</legend>${resource.fields.map((field) => fieldMarkup(field, profile)).join("")}</fieldset><div class="form-actions"><a class="btn secondary" href="?resource=available-animals" data-resource="available-animals">Browse animals</a><button class="btn primary" type="submit" id="profile-save">Save my details</button></div></form></section>`;
  $("adopter-profile-form").oninput = () => { context.dirty = true; };
  $("adopter-profile-form").onsubmit = async (event) => {
    event.preventDefault();
    if (context.busy) return;
    const values = Object.fromEntries(resource.fields.map((field) => [field.name, $("f-" + field.name).value]));
    const { body, errors } = buildPayload(resource, values, profile);
    for (const field of resource.fields) {
      const error = errors[field.name];
      $("f-" + field.name).setAttribute("aria-invalid", error ? "true" : "false");
      $("error-" + field.name).textContent = error || "";
      $("error-" + field.name).hidden = !error;
    }
    if (Object.keys(errors).length) {
      message("profile-message", "Check the marked fields.", "error");
      $("profile-message").innerHTML += `<ul>${Object.entries(errors).map(([name, error]) => `<li><a href="#f-${name}">${esc(error)}</a></li>`).join("")}</ul>`;
      $("profile-message").focus();
      return;
    }
    const owner = client.session;
    context.busy = true;
    $("profile-fields").disabled = true;
    $("profile-save").disabled = true;
    message("profile-message", "Saving your details...");
    try {
      const saved = readProfile(await client.request("adopter/profile", { method: "PUT", body }));
      if (!isCurrent(context) || owner !== client.session) return;
      if (!saved) throw new Error("The saved profile could not be confirmed. Reload your details to check.");
      context.dirty = false;
      context.busy = false;
      message("profile-message", "Your contact details are saved.", "success");
      announce("Contact details saved.");
      await onSaved(saved);
    } catch (error) {
      if (isCurrent(context) && owner === client.session) message("profile-message", error.message, "error");
    } finally {
      context.busy = false;
      if (isCurrent(context) && $("profile-save")) { $("profile-fields").disabled = false; $("profile-save").disabled = false; }
    }
  };
}
