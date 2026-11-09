import type { Resource } from "./resources";

export type Row = Record<string, string | number | null | { [key: string]: string }>;

export function dateValue(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value.slice(0, 10) : "";
}

function validDate(value: string, shelter: boolean): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (shelter && value < "1000-01-01")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildPayload(
  resource: Resource,
  values: Record<string, string>,
  original: Row | null = null,
): { body: Record<string, string | number | null>; errors: Record<string, string> } {
  const body: Record<string, string | number | null> = {};
  const errors: Record<string, string> = {};
  for (const field of resource.fields) {
    const value = String(values[field.name] ?? "");
    const raw = field.type === "password" ? value : value.trim();
    const isRequired = field.required || (field.createRequired && !original);
    if (!raw.trim()) {
      if (isRequired) errors[field.name] = `${field.label} is required.`;
      else if (original && field.noClear && original[field.name]) errors[field.name] = `${field.label} cannot be cleared. Keep or correct the date.`;
      else if (original && Object.hasOwn(field, "clear")) body[field.name] = field.clear ?? null;
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

export function readRows(resource: Resource, data: unknown): Row[] {
  if (!Array.isArray(data)) throw new Error(`Unexpected ${resource.label.toLowerCase()} response. Retry to load current records.`);
  const allowed = new Set([
    resource.idKey,
    ...resource.fields.filter((field) => field.type !== "password").map((field) => field.name),
    ...resource.columns,
    "created_at",
  ]);
  return data.map((row) => {
    if (!row || typeof row !== "object" || !Number.isSafeInteger((row as Row)[resource.idKey]) || ((row as Row)[resource.idKey] as number) <= 0) {
      throw new Error("The server returned an invalid record identifier.");
    }
    const clean: Row = {};
    for (const key of allowed) {
      if (!Object.hasOwn(row, key)) continue;
      const value = (row as Row)[key];
      if (value !== null && !["string", "number"].includes(typeof value)) {
        throw new Error("The server returned an unexpected field value.");
      }
      clean[key] = value as string | number | null;
    }
    for (const name of ["breed", "species"]) {
      const relation = (row as Row)[name];
      if (relation && typeof relation === "object" && typeof (relation as Record<string, unknown>)[`${name}_name`] === "string") {
        clean[name] = { [`${name}_name`]: (relation as Record<string, string>)[`${name}_name`] };
      }
    }
    return clean;
  });
}

export function deleteOutcome(resource: Resource, data: unknown, id: number): "deleted" | "missing" {
  const record = data as { affectedRows?: unknown; animal_id?: unknown; deleted?: unknown; id?: unknown } | null;
  if (resource.key === "users" && [0, 1].includes(record?.affectedRows as number)) return record?.affectedRows ? "deleted" : "missing";
  if (resource.key === "animal" && record?.animal_id === Number(id)) return "deleted";
  const returnedId = resource.path.startsWith("shelter/") ? record?.id : ((record as Record<string, unknown> | null)?.[resource.idKey] as number | undefined);
  if (record?.deleted === true && returnedId === Number(id)) return "deleted";
  throw new Error("Deletion could not be confirmed. Reload the records before trying again.");
}

export const normalized = (value: unknown): string => String(value ?? "").trim().toLowerCase();
export const isFinal = (status: unknown): boolean => ["adopted", "completed"].includes(normalized(status));

export function eligibleAnimals(
  animals: Row[],
  adoptions: Row[],
  applications: Row[],
  current: string | number = "",
): Row[] {
  const taken = new Set(
    [...adoptions, ...applications.filter((row) => isFinal(row.application_status))].map((row) => String(row.animal_id)),
  );
  return animals.filter(
    (row) => String(row.animal_id) === String(current) || (!taken.has(String(row.animal_id)) && normalized(row.adoption_status) !== "adopted"),
  );
}

export function recordName(resource: Resource, row: Row): string {
  const firstLast = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return (
    (row.animal_name as string) ||
    (row.username as string) ||
    (row.species_name as string) ||
    (row.breed_name as string) ||
    (row.name as string) ||
    firstLast ||
    `${resource.singular} ${row[resource.idKey]}`
  );
}

export function fieldValue(
  resource: Resource,
  row: Row,
  name: string,
  references: Record<string, Row[]> = {},
): string {
  const value = row[name];
  if (value === null || value === undefined || value === "") return "Not set";
  const field = resource.fields.find((entry) => entry.name === name);
  if (field?.type === "date") return dateValue(value) || String(value);
  if (field?.ref) {
    const ref = field.ref;
    const related = references[ref]?.find(
      (item) =>
        String(item[`${ref.replace(/-/g, "_")}_id`] ?? item.application_id ?? item.id) === String(value),
    );
    const nested = (row[ref] as Record<string, string> | undefined)?.[`${ref}_name`];
    const label =
      nested ||
      (related &&
        ((related.animal_name as string) ||
          (related.breed_name as string) ||
          (related.species_name as string) ||
          [related.first_name, related.last_name].filter(Boolean).join(" ")));
    return label ? `${label} ${value}` : `${value}`;
  }
  return String(value);
}
