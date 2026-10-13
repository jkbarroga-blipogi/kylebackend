import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Breed } from './breed.entity';

@Entity('Animal')
export class Animal {
  @PrimaryGeneratedColumn({ name: 'animal_id' })
  animal_id!: number;

  @Column({ name: 'breed_id' })
  breed_id!: number;

  @Column({ name: 'animal_name', length: 100 })
  animal_name!: string;

  @Column({ name: 'sex', length: 10 })
  sex!: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birth_date!: string;

  @Column({ name: 'color', length: 50, nullable: true })
  color!: string;

  @Column({ name: 'arrival_date', type: 'date' })
  arrival_date!: string;

  @Column({ name: 'adoption_status', length: 20, default: 'Available' })
  adoption_status!: string;

  @ManyToOne(() => Breed)
@JoinColumn({ name: 'breed_id' })
breed!: Breed;
} 