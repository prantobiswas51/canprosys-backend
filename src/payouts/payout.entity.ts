import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Task } from '../tasks/task.entity';
import { DailyEntry } from '../daily-entry/daily-entry.entity';
import { WoodProcessingEntry } from '../wood-processing/wood-processing-entry.entity';

// One row per (employee, daily entry) pair -- generated, not hand-created.
// Fields are a snapshot at generation time (name/rate copied in as plain
// columns, not just relations) so a later rename or a Task price change
// doesn't retroactively alter a payout that's already been generated.
@Entity()
export class Payout {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee!: Employee;

  @Column()
  employeeId!: number;

  @Column()
  employeeName!: string;

  @ManyToOne(() => Task, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'taskId' })
  task?: Task;

  @Column({ nullable: true })
  taskId?: number;

  @Column()
  taskName!: string;

  @ManyToOne(() => DailyEntry, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dailyEntryId' })
  dailyEntry?: DailyEntry;

  @Column({ nullable: true })
  dailyEntryId?: number;

  // Set instead of dailyEntryId when this payout came from a wood
  // processing run rather than a daily entry -- taskId stays null for
  // these, taskName holds the stage name (e.g. "Wood Slicing") so this
  // still displays sensibly anywhere Payout rows are listed, without any
  // frontend changes needed.
  @ManyToOne(() => WoodProcessingEntry, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'woodProcessingEntryId' })
  woodProcessingEntry?: WoodProcessingEntry;

  @Column({ nullable: true })
  woodProcessingEntryId?: number;

  // This employee's equal share of the entry's total weight -- entry.weightKg
  // divided by however many artisans were on it.
  @Column('float')
  weightShare!: number;

  @Column('float')
  ratePerUnit!: number;

  // weightShare * ratePerUnit
  @Column('float')
  amount!: number;

  // YYYY-MM, taken from the daily entry's own date -- not from when this
  // payout row was generated -- so month filtering reflects when the work
  // actually happened.
  @Column()
  periodMonth!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
