import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('Species')
export class Species {
  @PrimaryGeneratedColumn({ name: 'species_id' })
  species_id!: number;

  @Column({ name: 'species_name', length: 50, unique: true })
  species_name!: string;
}