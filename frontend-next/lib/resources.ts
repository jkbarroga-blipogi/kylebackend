export type FieldType = "text" | "password" | "email" | "tel" | "date" | "number" | "select" | "textarea";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  createRequired?: boolean;
  editOnly?: boolean;
  ref?: string;
  options?: string[];
  maxLength?: number;
  minLength?: number;
  defaultValue?: string;
  hint?: string;
  clear?: null;
  noClear?: boolean;
};

export type Resource = {
  key: string;
  label: string;
  singular: string;
  group: string;
  path: string;
  createPath?: string;
  idKey: string;
  description: string;
  columns: string[];
  fields: Field[];
};

const field = (name: string, label: string, type: FieldType = "text", options: Partial<Field> = {}): Field => ({ name, label, type, ...options });
const required = { required: true };
const reference = (name: string, label: string, ref: string): Field => field(name, label, "number", { required: true, ref });
const personFields: Field[] = [
  field("first_name", "First name", "text", { ...required, maxLength: 50 }),
  field("last_name", "Last name", "text", { ...required, maxLength: 50 }),
];

export const resources: Resource[] = [
  {
    key: "animal",
    label: "Animals",
    singular: "animal",
    group: "Animal care",
    path: "animal",
    idKey: "animal_id",
    description: "Every animal, and the details that help you care for them.",
    columns: ["animal_name", "breed_id", "sex", "arrival_date", "adoption_status"],
    fields: [
      reference("breed_id", "Breed", "breed"),
      field("animal_name", "Animal name", "text", required),
      field("sex", "Sex", "select", { ...required, options: ["Male", "Female"] }),
      field("birth_date", "Birth date", "date", { noClear: true, hint: "An existing birth date can be corrected, but cannot be cleared." }),
      field("color", "Color", "text", { clear: null }),
      field("arrival_date", "Arrival date", "date", required),
      field("adoption_status", "Status", "text", { ...required, defaultValue: "Available", hint: "Changing this field does not update adoption records." }),
      field("image_url", "Photo", "text", { clear: null, hint: "Upload a photo. It is compressed automatically." }),
    ],
  },
  {
    key: "medical-record",
    label: "Medical records",
    singular: "medical record",
    group: "Animal care",
    path: "shelter/medical-record",
    idKey: "medical_record_id",
    description: "Keep each animal's care history close at hand.",
    columns: ["animal_id", "record_date", "diagnosis", "staff_id"],
    fields: [
      reference("animal_id", "Animal", "animal"),
      reference("staff_id", "Staff member", "staff"),
      field("record_date", "Record date", "date", required),
      ...(["diagnosis", "treatment", "notes"] as const).map(
        (name): Field => field(name, name[0].toUpperCase() + name.slice(1), "textarea", { clear: null }),
      ),
    ],
  },
  {
    key: "adopter",
    label: "Adopters",
    singular: "adopter",
    group: "Adoption",
    path: "shelter/adopter",
    idKey: "adopter_id",
    description: "The people ready to give an animal a place to belong.",
    columns: ["first_name", "last_name", "phone", "email"],
    fields: [
      ...personFields,
      field("phone", "Phone", "tel", { ...required, maxLength: 20 }),
      field("address", "Address", "textarea", { ...required, maxLength: 255 }),
      field("email", "Email", "email", { clear: null, maxLength: 100 }),
    ],
  },
  {
    key: "adoption-application",
    label: "Applications",
    singular: "application",
    group: "Adoption",
    path: "shelter/adoption-application",
    idKey: "application_id",
    description: "Follow each application from first interest to the next step.",
    columns: ["animal_id", "adopter_id", "application_date", "application_status"],
    fields: [
      reference("animal_id", "Animal", "animal"),
      reference("adopter_id", "Adopter", "adopter"),
      reference("staff_id", "Staff member", "staff"),
      field("application_date", "Application date", "date", required),
      field("application_status", "Status", "text", {
        ...required,
        defaultValue: "Pending",
        hint: "Record the adoption first. Adopted or Completed marks the animal adopted and rejects other open applications.",
      }),
    ],
  },
  {
    key: "adoption",
    label: "Adoptions",
    singular: "adoption",
    group: "Adoption",
    path: "shelter/adoption",
    idKey: "adoption_id",
    description: "Record new beginnings and the people who made them possible.",
    columns: ["animal_id", "adopter_id", "adoption_date", "application_id"],
    fields: [
      reference("application_id", "Application", "adoption-application"),
      reference("animal_id", "Animal", "animal"),
      reference("adopter_id", "Adopter", "adopter"),
      reference("staff_id", "Staff member", "staff"),
      field("adoption_date", "Adoption date", "date", required),
    ],
  },
  {
    key: "species",
    label: "Species",
    singular: "species",
    group: "Animal care",
    path: "species",
    idKey: "species_id",
    description: "Organize the species in your shelter.",
    columns: ["species_name"],
    fields: [field("species_name", "Species name", "text", { ...required, maxLength: 50 })],
  },
  {
    key: "breed",
    label: "Breeds",
    singular: "breed",
    group: "Animal care",
    path: "breed",
    idKey: "breed_id",
    description: "Connect each breed to its species.",
    columns: ["breed_name", "species_id"],
    fields: [
      reference("species_id", "Species", "species"),
      field("breed_name", "Breed name", "text", { ...required, maxLength: 100 }),
    ],
  },
  {
    key: "staff",
    label: "Staff",
    singular: "staff member",
    group: "Administration",
    path: "shelter/staff",
    idKey: "staff_id",
    description: "The team behind every day of care.",
    columns: ["first_name", "last_name", "position", "phone", "email"],
    fields: [
      ...personFields,
      field("position", "Position", "text", required),
      field("phone", "Phone", "tel", { clear: null }),
      field("email", "Email", "email", { clear: null }),
    ],
  },
  {
    key: "users",
    label: "Users",
    singular: "user",
    group: "Administration",
    path: "users",
    createPath: "auth/register",
    idKey: "id",
    description: "Manage accounts and assign user, volunteer, staff, or admin roles.",
    columns: ["username", "email", "role", "created_at"],
    fields: [
      field("username", "Username", "text", required),
      field("email", "Email", "email", { clear: null, maxLength: 255, hint: "Optional. The user can sign in with username or email." }),
      field("role", "Role", "select", {
        editOnly: true,
        options: ["user", "staff", "volunteer", "admin"],
        defaultValue: "user",
        hint: "Choose the account role (for example: user, staff, volunteer, or admin).",
      }),
      field("password", "New password", "password", {
        createRequired: true,
        minLength: 8,
        hint: "Use at least 8 characters. On edit, leave blank to keep the current password. Spaces are preserved.",
      }),
    ],
  },
];

export const getResource = (key: string): Resource | undefined => resources.find((item) => item.key === key);
export const provisioned = (role: string): boolean => ["admin", "staff", "volunteer", "user"].includes(role);

export function canAccess(role: string, key: string): boolean {
  if (!getResource(key)) return false;
  return role === "admin" || (role === "staff" && key !== "users") || (role === "volunteer" && key === "animal");
}

export function canWrite(role: string, key: string): boolean {
  return canAccess(role, key) && (role === "admin" || (role === "staff" && key !== "staff"));
}

export const animalTabs = ["animal", "species", "breed"] as const;
export type AnimalTabKey = (typeof animalTabs)[number];
