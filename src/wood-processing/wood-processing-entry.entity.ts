import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WoodStage } from './wood-stage.entity';
import { Employee } from '../employees/employee.entity';

// The log of one processing event -- "N artisans ran stage S today,
// produced X kg good output and Y kg waste". Everything else (stock
// consumption/production, wages) is derived from these three numbers by
// WoodProcessingService, not stored redundantly here.
@Entity()
export class WoodProcessingEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => WoodStage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stageId' })
  stage!: WoodStage;

  @Column()
  stageId!: number;

  // Snapshot -- a later stage rename shouldn't retroactively alter a past
  // entry's display.
  @Column()
  stageName!: string;

  @ManyToMany(() => Employee)
  @JoinTable({
    name: 'wood_processing_entry_employees',
    joinColumn: { name: 'woodProcessingEntryId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employeeId', referencedColumnName: 'id' },
  })
  employees!: Employee[];

  // Weight taken from the input stock BEFORE processing -- what's drawn
  // from the input wood type's stock, and what wages are based on. This is
  // the number the operator actually knows going in (e.g. "I took 10kg of
  // raw wood to slice"), not something they'd have to compute themselves.
  @Column('float')
  consumedQuantity!: number;

  // Whatever didn't survive processing as good output. Zero is fine (no
  // waste that run).
  @Column('float')
  wasteQuantity!: number;

  // Derived: consumedQuantity - wasteQuantity. The good, useable output of
  // this step -- what the produced batch's quantity is set to.
  @Column('float')
  outputQuantity!: number;

  // Snapshot of WoodStage.wageRatePerUnit at the moment this entry was
  // saved -- so a later rate change doesn't rewrite this entry's payout.
  @Column('float')
  wageRateUsed!: number;

  @Column({ type: 'date', nullable: true })
  entryDate?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
