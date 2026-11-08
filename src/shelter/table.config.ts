// Table contracts for the shelter-oriented resources served over raw SQL.
// One entry per exposed route family. Adding a table means adding an entry.
import { NotFoundException } from '@nestjs/common';

export type TableConfig = {
  table: string;
  id: string;
  required: string[];
  optional: string[];
  defaults?: string[];
};

export const TABLES: Record<string, TableConfig> = {
  adopter: {
    table: 'Adopter',
    id: 'adopter_id',
    required: ['first_name', 'last_name', 'phone', 'address'],
    optional: ['email'],
  },

  staff: {
    table: 'Staff',
    id: 'staff_id',
    required: ['first_name', 'last_name', 'position'],
    optional: ['phone', 'email'],
  },

  'adoption-application': {
    table: 'Adoption_Application',
    id: 'application_id',
    required: [
      'animal_id',
      'adopter_id',
      'staff_id',
      'application_date',
    ],
    optional: [],
    defaults: ['application_status'],
  },

  'medical-record': {
    table: 'Medical_Record',
    id: 'medical_record_id',
    required: ['animal_id', 'staff_id', 'record_date'],
    optional: ['diagnosis', 'treatment', 'notes'],
  },

  adoption: {
    table: 'Adoption',
    id: 'adoption_id',
    required: [
      'application_id',
      'animal_id',
      'adopter_id',
      'staff_id',
      'adoption_date',
    ],
    optional: [],
  },
};

export function config() {
  return TABLES;
}

export function configFor(resource: string): TableConfig {
  if (!Object.prototype.hasOwnProperty.call(TABLES, resource)) {
    throw new NotFoundException('Unknown resource');
  }

  return TABLES[resource];
}
