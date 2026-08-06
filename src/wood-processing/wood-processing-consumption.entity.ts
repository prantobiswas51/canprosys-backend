import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WoodProcessingEntry } from './wood-processing-entry.entity';
import { WoodStockBatch } from './wood-stock-batch.entity';

// One row per (processing entry, input batch drawn from) pair -- the FIFO
// draw for one entry can span more than one batch, same as
// MaterialConsumption. This is the traceability trail: "this waste / this
// output batch came from these specific upstream batches".
@Entity()
export class WoodProcessingConsumption {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => WoodProcessingEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entryId' })
  entry!: WoodProcessingEntry;

  @Column()
  entryId!: number;

  @ManyToOne(() => WoodStockBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batchId' })
  batch?: WoodStockBatch;

  @Column({ nullable: true })
  batchId?: number;

  @Column('float')
  quantity!: number;

  // Snapshot of the batch's unitPrice at draw time.
  @Column('float')
  unitCost!: number;

  @Column('float')
  totalCost!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
