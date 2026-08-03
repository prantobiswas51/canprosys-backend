import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum EmployeeStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity()
export class Employee {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  // Unique so the same phone number can't be registered to two employees --
  // nullable + unique is fine in Postgres, multiple NULLs are allowed under
  // a unique constraint (only actual duplicate values are rejected).
  @Column({ nullable: true, unique: true })
  phone?: string;

  @Column({ type: 'enum', enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
  status!: EmployeeStatus;

  // Nullable -- not surfaced in the create/edit form (no manager-picker UI
  // built yet), so it has to be optional or creation would fail.
  @Column({ nullable: true })
  managerId?: number;

  @Column({ nullable: true })
  pin?: number;

  // Accrued wages in BDT -- credited automatically by PayoutsService
  // whenever a Payout row is created for this employee (from a daily entry
  // or a batch "Generate Payouts" run). Not directly editable on the
  // Employees page; it's a running total, not a manual entry field.
  @Column('float', { default: 0 })
  balance!: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerId' })
  manager?: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
