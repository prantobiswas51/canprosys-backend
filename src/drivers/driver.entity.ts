import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum DriverStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity()
export class Driver {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  phone?: string;

  // Nullable+unique is safe in Postgres -- multiple NULLs are allowed even
  // under a unique constraint, only actual duplicate values are rejected.
  @Column({ unique: true, nullable: true })
  licenseNumber?: string;

  @Column({ type: 'enum', enum: DriverStatus, default: DriverStatus.ACTIVE })
  status!: DriverStatus;
}
