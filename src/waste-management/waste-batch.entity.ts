import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WasteType } from './waste-type.entity';
import { WoodProcessingEntry } from '../wood-processing/wood-processing-entry.entity';

// "Waste add" -- a batch of waste collected, either automatically (created
// by WoodProcessingService whenever a processing entry reports
// wasteQuantity > 0 -- sourceEntryId traces it back to that exact run and,
// from there, back to the upstream wood batches it was drawn from) or
// manually (sourceEntryId left null). No cost basis -- see the wood
// processing cost formula for why waste is treated as a free byproduct.
@Entity()
export class WasteBatch {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => WasteType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'wasteTypeId' })
  wasteType!: WasteType;

  @Column()
  wasteTypeId!: number;

  @Column()
  wasteTypeName!: string;

  @Column('float')
  quantity!: number;

  // Decremented as WasteSale entries draw from this batch (FIFO).
  @Column('float')
  quantityRemaining!: number;

  @ManyToOne(() => WoodProcessingEntry, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourceEntryId' })
  sourceEntry?: WoodProcessingEntry;

  @Column({ nullable: true })
  sourceEntryId?: number;

  @Column({ type: 'date' })
  collectedDate!: string;

  @Column({ nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
