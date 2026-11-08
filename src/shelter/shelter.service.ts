import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { configFor } from './table.config';
import * as crud from './crud';
import * as adoptionFlow from './transactions';

@Injectable()
export class ShelterService {
  constructor(private readonly db: DatabaseService) {}

  // GET: all records
  findAll(resource: string) {
    return crud.findAll(this.db, resource);
  }

  // GET: one record
  findOne(resource: string, id: number) {
    return crud.findOne(this.db, resource, id);
  }

  // POST
  async create(resource: string, body: unknown) {
    configFor(resource);

    if (resource === 'adoption') {
      return adoptionFlow.createAdoption(this.db, body);
    }

    if (resource === 'adoption-application') {
      return adoptionFlow.createAdoptionApplication(this.db, body);
    }

    return crud.create(this.db, resource, body);
  }

  // PUT: update the supplied fields
  async update(resource: string, id: number, body: unknown) {
    configFor(resource);

    if (resource === 'adoption') {
      return adoptionFlow.updateAdoption(this.db, id, body);
    }

    if (resource === 'adoption-application') {
      return adoptionFlow.updateAdoptionApplication(this.db, id, body);
    }

    return crud.update(this.db, resource, id, body);
  }

  // DELETE
  async remove(resource: string, id: number) {
    configFor(resource);

    if (resource === 'adoption') {
      return adoptionFlow.removeAdoption(this.db, id);
    }

    if (resource === 'adoption-application') {
      return adoptionFlow.removeAdoptionApplication(this.db, id);
    }

    return crud.remove(this.db, resource, id);
  }
}
