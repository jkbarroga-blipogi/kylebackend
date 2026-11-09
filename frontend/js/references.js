import { getResource } from "./resources.js";
import { eligibleAnimals, isFinal, normalized, readRows, recordName, dateValue } from "./records.js";

export async function loadReferences(client, resource) {
  const keys = new Set(resource.fields.map((field) => field.ref).filter(Boolean));
  if (["adoption", "adoption-application"].includes(resource.key)) {
    for (const key of ["animal", "adoption", "adoption-application"]) keys.add(key);
  }
  const entries = await Promise.all([...keys].map(async (key) => [key, readRows(getResource(key), await client.request(getResource(key).path))]));
  return Object.fromEntries(entries);
}

function referenceLabel(resource, row) {
  if (resource.key === "adoption-application") return `Application ${row.application_id}: animal ${row.animal_id}, adopter ${row.adopter_id}, ${dateValue(row.application_date)}, ${row.application_status}`;
  return `${recordName(resource, row)} ${row[resource.idKey]}`;
}

export function populateReferences(resource, row, references, form) {
  const adoptionFlow = ["adoption", "adoption-application"].includes(resource.key);
  const animals = adoptionFlow ? eligibleAnimals(references.animal, references.adoption, references["adoption-application"], row?.animal_id) : [];
  const eligibleIds = new Set(animals.map((animal) => String(animal.animal_id)));
  const missing = [];
  for (const field of resource.fields.filter((entry) => entry.ref)) {
    const select = form.elements.namedItem(field.name);
    const current = select.value || String(row?.[field.name] ?? "");
    const relatedResource = getResource(field.ref);
    let choices = references[field.ref];
    if (adoptionFlow && field.name === "animal_id") choices = animals;
    if (resource.key === "adoption" && field.name === "application_id") {
      choices = choices.filter((application) => String(application.application_id) === current || (
        eligibleIds.has(String(application.animal_id)) && !isFinal(application.application_status)
        && !["rejected", "cancelled", "canceled"].includes(normalized(application.application_status))
        && !references.adoption.some((adoption) => adoption.application_id === application.application_id)
      ));
    }
    select.replaceChildren(new Option(`Choose ${field.label.toLowerCase()}`, ""));
    for (const choice of choices) select.add(new Option(referenceLabel(relatedResource, choice), String(choice[relatedResource.idKey])));
    if (current && !choices.some((choice) => String(choice[relatedResource.idKey]) === current)) {
      const retained = new Option(`${current} (unavailable)`, current);
      retained.dataset.missing = "true";
      select.add(retained);
    }
    select.value = current;
    select.disabled = false;
    if (!choices.length && !current) missing.push(field);
  }
  if (resource.key === "adoption") {
    const application = form.elements.namedItem("application_id");
    const sync = () => {
      const chosen = references["adoption-application"].find((item) => String(item.application_id) === application.value);
      for (const name of ["animal_id", "adopter_id"]) {
        const input = form.elements.namedItem(name);
        input.value = chosen ? String(chosen[name]) : "";
        input.disabled = true;
      }
    };
    application.onchange = sync;
    sync();
  }
  return missing;
}
