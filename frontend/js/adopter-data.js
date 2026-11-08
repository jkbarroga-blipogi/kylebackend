const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const text = (value) => typeof value === "string";

function project(row, fields, checks) {
  if (!row || typeof row !== "object" || Array.isArray(row) || !Object.entries(checks).every(([key, check]) => check(row[key]))) throw new Error("The server returned an unexpected adopter record. Reload to try again.");
  return Object.fromEntries(fields.map((key) => [key, row[key] ?? null]));
}
export function readAnimals(data) {
  if (!Array.isArray(data)) throw new Error("The server returned an unexpected animal list.");
  return data.map((row) => project(row, ["animal_id", "animal_name", "sex", "color", "birth_date", "arrival_date", "adoption_status", "breed_name", "species_name"], {
    animal_id: positiveId, animal_name: text, sex: text, breed_name: text, species_name: text, adoption_status: text,
    color: (value) => value === null || text(value), birth_date: (value) => value === null || text(value), arrival_date: text,
  }));
}
export function readApplication(row) {
  return project(row, ["application_id", "animal_id", "animal_name", "application_date", "application_status", "reviewer_assigned"], {
    application_id: positiveId, animal_id: positiveId, animal_name: text, application_date: text, application_status: text, reviewer_assigned: (value) => typeof value === "boolean",
  });
}
export function readApplications(data) {
  if (!Array.isArray(data)) throw new Error("The server returned an unexpected application list.");
  return data.map(readApplication);
}
export function readProfile(row) {
  if (row === null) return null;
  return project(row, ["adopter_id", "first_name", "last_name", "phone", "address", "email"], {
    adopter_id: positiveId, first_name: text, last_name: text, phone: text, address: text, email: (value) => value === null || text(value),
  });
}
