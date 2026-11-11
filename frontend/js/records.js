export function dateValue(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value.slice(0, 10) : "";
}

function validDate(value, shelter) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (shelter && value < "1000-01-01")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildPayload(resource, values, original = null) {
  const body = {};
  const errors = {};
  for (const field of resource.fields) {
    if (field.editOnly && !original) continue;
    const value = String(values[field.name] ?? "");
    const raw = field.type === "password" ? value : value.trim();
    const required = field.required || (field.createRequired && !original);
    if (!raw.trim()) {
      if (required) errors[field.name] = `${field.label} is required.`;
      else if (original && field.noClear && original[field.name]) errors[field.name] = `${field.label} cannot be cleared. Keep or correct the date.`;
      else if (original && Object.hasOwn(field, "clear")) body[field.name] = field.clear;
      continue;
    }
    if (field.type === "number") {
      const number = Number(raw);
      if (!Number.isSafeInteger(number) || number <= 0) errors[field.name] = `Choose a valid ${field.label.toLowerCase()}.`;
      else body[field.name] = number;
    } else if (field.type === "date" && !validDate(raw, resource.path.startsWith("shelter/"))) {
      errors[field.name] = "Enter a real calendar date" + (resource.path.startsWith("shelter/") ? " from year 1000 onward." : ".");
    } else if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      errors[field.name] = "Enter a valid email address.";
    } else if (field.minLength && raw.length < field.minLength) {
      errors[field.name] = `Use at least ${field.minLength} characters.`;
    } else if (field.maxLength && raw.length > field.maxLength) {
      errors[field.name] = `Use ${field.maxLength} characters or fewer.`;
    } else {
      body[field.name] = raw;
    }
  }
  return { body, errors };
}

export function readRows(resource, data) {
  if (!Array.isArray(data)) throw new Error(`Unexpected ${resource.label.toLowerCase()} response. Retry to load current records.`);
  const allowed = new Set([resource.idKey, ...resource.fields.filter((field) => field.type !== "password").map((field) => field.name), ...resource.columns, "created_at"]);
  return data.map((row) => {
    if (!row || typeof row !== "object" || !Number.isSafeInteger(row[resource.idKey]) || row[resource.idKey] <= 0) throw new Error("The server returned an invalid record identifier.");
    const clean = {};
    for (const key of allowed) {
      if (!Object.hasOwn(row, key)) continue;
      const value = row[key];
      if (value !== null && !["string", "number"].includes(typeof value)) throw new Error("The server returned an unexpected field value.");
      clean[key] = value;
    }
    for (const name of ["breed", "species"]) {
      const relation = row[name];
      if (relation && typeof relation === "object" && typeof relation[`${name}_name`] === "string") {
        clean[name] = { [`${name}_name`]: relation[`${name}_name`] };
      }
    }
    return clean;
  });
}

export function deleteOutcome(resource, data, id) {
  if (resource.key === "users" && [0, 1].includes(data?.affectedRows)) return data.affectedRows ? "deleted" : "missing";
  if (resource.key === "animal" && data?.animal_id === Number(id)) return "deleted";
  const returnedId = resource.path.startsWith("shelter/") ? data?.id : data?.[resource.idKey];
  if (data?.deleted === true && returnedId === Number(id)) return "deleted";
  throw new Error("Deletion could not be confirmed. Reload the records before trying again.");
}

export const normalized = (value) => String(value ?? "").trim().toLowerCase();
export const isFinal = (status) => ["adopted", "completed"].includes(normalized(status));

export function eligibleAnimals(animals, adoptions, applications, current = "") {
  const taken = new Set([...adoptions, ...applications.filter((row) => isFinal(row.application_status))].map((row) => String(row.animal_id)));
  return animals.filter((row) => String(row.animal_id) === String(current) || (!taken.has(String(row.animal_id)) && normalized(row.adoption_status) !== "adopted"));
}

export function recordName(resource, row) {
  return row.animal_name || row.username || row.species_name || row.breed_name || row.name || [row.first_name, row.last_name].filter(Boolean).join(" ") || `${resource.singular} ${row[resource.idKey]}`;
}

export function fieldValue(resource, row, name, references = {}) {
  const value = row[name];
  if (value === null || value === undefined || value === "") return "Not set";
  const field = resource.fields.find((entry) => entry.name === name);
  if (field?.type === "date") return dateValue(value) || String(value);
  if (field?.ref) {
    const related = references[field.ref]?.find((item) => String(item[`${field.ref.replace(/-/g, "_")}_id`] ?? item.application_id ?? item.id) === String(value));
    const nested = row[field.ref]?.[`${field.ref}_name`];
    const label = nested || (related && (related.animal_name || related.breed_name || related.species_name || [related.first_name, related.last_name].filter(Boolean).join(" ")));
    return label ? `${label} ${value}` : `${value}`;
  }
  return String(value);
}
