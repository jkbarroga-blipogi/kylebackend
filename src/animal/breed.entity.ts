import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Species } from './species.entity';

@Entity('Breed')
export class Breed {
  @PrimaryGeneratedColumn({ name: 'breed_id' })
  breed_id!: number;

  @Column({ name: 'species_id' })
  species_id!: number;

  @Column({ name: 'breed_name', length: 100 })
  breed_name!: string;

  @ManyToOne(() => Species)
  @JoinColumn({ name: 'species_id' })
  species!: Species;
}