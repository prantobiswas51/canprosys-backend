import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WoodType } from './wood-type.entity';
import { WoodProcessingEntry } from './wood-processing-entry.entity';

// One row per batch of stock at any stage -- raw wood purchases AND
// processed output (sliced, cut, etc) all live in this one table, same
// FIFO-batch pattern as MaterialBatch. sourceEntryId is null for a
// purchased batch (bought directly, no processing involved) and set for a
// produced batch (traces back to the WoodProcessingEntry that made it, and
// from there -- via WoodProcessingConsumption -- to exactly which upstream
// batches went into it).
@Entity()
export class WoodStockBatch {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => WoodType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'woodTypeId' })
  woodType!: WoodType;

  @Column()
  woodTypeId!: number;

  // Snapshot -- same reason as MaterialBatch.rawMaterialName.
  @Column()
  woodTypeName!: string;

  @Column('float')
  quantity!: number;

  // Starts equal to quantity, decremented as later stages (or waste) draw
  // from it via WoodProcessingConsumption.
  @Column('float')
  quantityRemaining!: number;

  @Column('float')
  unitPrice!: number;

  // quantity * unitPrice, stored at write time. For a purchased batch this
  // is just what was paid; for a produced batch it's
  // (consumed x source unit price) + wages -- see WoodProcessingService.
  @Column('float')
  totalCost!: number;

  @ManyToOne(() => WoodProcessingEntry, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourceEntryId' })
  sourceEntry?: WoodProcessingEntry;

  @Column({ nullable: true })
  sourceEntryId?: number;

  @Column({ type: 'date', nullable: true })
  batchDate?: string;

  @Column({ nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
