import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { DatabaseService } from '../database/database.service';
import { translateSqlError } from '../database/sql-errors';
import { inTx } from '../shelter/tx';
import { checkId } from '../shelter/validation';
import { lockAnimalRow, assertAnimalNotAdopted, assertNoOtherAdoptedApplication } from '../shelter/transactions';
import { applicationSchema, profileSchema } from './adopter.validation';
import { parseBody } from '../request-validation';

type QueryConnection = Pool | PoolConnection;
interface ProfileRow extends RowDataPacket {
  adopter_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  email: string | null;
}
interface ApplicationRow extends RowDataPacket {
  application_id: number;
  animal_id: number;
  animal_name: string;
  application_date: string;
  application_status: string;
  reviewer_assigned: number;
}
const profileColumns = 'adopter_id, first_name, last_name, phone, address, email';
const applicationSelect = `SELECT app.application_id, app.animal_id, animal.animal_name,
  DATE_FORMAT(app.application_date, '%Y-%m-%d') AS application_date,
  app.application_status, (app.staff_id IS NOT NULL) AS reviewer_assigned
  FROM Adoption_Application app
  INNER JOIN Adopter adopter ON adopter.adopter_id = app.adopter_id
  INNER JOIN Animal animal ON animal.animal_id = app.animal_id
  WHERE adopter.user_id = ?`;

@Injectable()
export class AdopterService {
  constructor(private readonly db: DatabaseService) {}

  private async database<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      throw translateSqlError(error) || new InternalServerErrorException('The request could not be completed');
    }
  }

  async listAnimals() {
    return this.database(async () => {
      const [rows] = await this.db.getPool().execute<RowDataPacket[]>(`SELECT animal.animal_id, animal.animal_name,
        animal.sex, animal.color, DATE_FORMAT(animal.birth_date, '%Y-%m-%d') AS birth_date,
        DATE_FORMAT(animal.arrival_date, '%Y-%m-%d') AS arrival_date, animal.adoption_status,
        breed.breed_name, species.species_name
        FROM Animal animal
        INNER JOIN Breed breed ON breed.breed_id = animal.breed_id
        INNER JOIN Species species ON species.species_id = breed.species_id
        WHERE LOWER(TRIM(animal.adoption_status)) = 'available'
          AND NOT EXISTS (SELECT 1 FROM Adoption adoption WHERE adoption.animal_id = animal.animal_id)
          AND NOT EXISTS (SELECT 1 FROM Adoption_Application app WHERE app.animal_id = animal.animal_id
            AND LOWER(TRIM(app.application_status)) IN ('adopted', 'completed'))
        ORDER BY animal.arrival_date DESC, animal.animal_id DESC`);
      return rows;
    });
  }

  async getProfile(userId: number, connection: QueryConnection = this.db.getPool()) {
    checkId(userId);
    return this.database(async () => {
      const [rows] = await connection.execute<ProfileRow[]>(`SELECT ${profileColumns} FROM Adopter WHERE user_id = ?`, [userId]);
      return rows[0] || null;
    });
  }

  async saveProfile(userId: number, input: unknown) {
    checkId(userId);
    const body = parseBody(profileSchema, input);
    return this.database(() => inTx(this.db, async connection => {
      const [accounts] = await connection.execute<RowDataPacket[]>('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      if (!accounts.length) throw new NotFoundException('Account not found');
      const [existing] = await connection.execute<RowDataPacket[]>('SELECT adopter_id FROM Adopter WHERE user_id = ? FOR UPDATE', [userId]);
      const values = [body.first_name, body.last_name, body.phone, body.address, body.email];
      if (existing.length) {
        await connection.execute('UPDATE Adopter SET first_name = ?, last_name = ?, phone = ?, address = ?, email = ? WHERE user_id = ?', [...values, userId]);
      } else {
        await connection.execute('INSERT INTO Adopter (user_id, first_name, last_name, phone, address, email) VALUES (?, ?, ?, ?, ?, ?)', [userId, ...values]);
      }
      return this.getProfile(userId, connection);
    }));
  }

  async listApplications(userId: number) {
    checkId(userId);
    return this.database(async () => {
      const [rows] = await this.db.getPool().execute<ApplicationRow[]>(`${applicationSelect} ORDER BY app.application_date DESC, app.application_id DESC`, [userId]);
      return rows.map(row => ({ ...row, reviewer_assigned: Boolean(row.reviewer_assigned) }));
    });
  }

  async getApplication(userId: number, applicationId: number, connection: QueryConnection = this.db.getPool()) {
    checkId(userId);
    checkId(applicationId);
    return this.database(async () => {
      const [rows] = await connection.execute<ApplicationRow[]>(`${applicationSelect} AND app.application_id = ?`, [userId, applicationId]);
      if (!rows[0]) throw new NotFoundException('Application not found');
      return { ...rows[0], reviewer_assigned: Boolean(rows[0].reviewer_assigned) };
    });
  }

  async createApplication(userId: number, input: unknown) {
    checkId(userId);
    const { animal_id: animalId } = parseBody(applicationSchema, input);
    return this.database(() => inTx(this.db, async connection => {
      const animal = await lockAnimalRow(connection, animalId);
      if (String(animal.adoption_status).trim().toLowerCase() !== 'available') throw new ConflictException('This animal is no longer available for applications');
      await assertAnimalNotAdopted(connection, animalId, animal.adoption_status);
      await assertNoOtherAdoptedApplication(connection, animalId, 0);
      const [profiles] = await connection.execute<RowDataPacket[]>('SELECT adopter_id FROM Adopter WHERE user_id = ?', [userId]);
      const adopterId: unknown = profiles[0]?.adopter_id;
      if (typeof adopterId !== 'number' || !Number.isSafeInteger(adopterId) || adopterId <= 0) throw new BadRequestException('Save your contact details before submitting an application');
      const [existing] = await connection.execute<RowDataPacket[]>(`SELECT application_id FROM Adoption_Application
        WHERE animal_id = ? AND adopter_id = ? AND LOWER(TRIM(application_status)) NOT IN ('rejected', 'cancelled', 'canceled')
        LIMIT 1 FOR UPDATE`, [animalId, adopterId]);
      if (existing.length) throw new ConflictException('You already have an open application for this animal');
      const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO Adoption_Application
        (animal_id, adopter_id, staff_id, application_date, application_status)
        VALUES (?, ?, NULL, UTC_DATE(), 'Pending')`, [animalId, adopterId]);
      return this.getApplication(userId, result.insertId, connection);
    }));
  }
}
