import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum CarStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  INACTIVE = 'inactive',
}

@Entity()
export class Car {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  plateNumber!: string; // e.g. DHAKA-METRO-GA-12-3456

  @Column()
  model!: string; // e.g. Toyota Hiace

  @Column('float')
  capacityKg!: number; // load capacity

  @Column({ type: 'enum', enum: CarStatus, default: CarStatus.ACTIVE })
  status!: CarStatus;
}
