import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RawMaterial } from '../raw-materials/raw-material.entity';

// One row per purchase event. Rows are effectively immutable once
// consumption has drawn from them -- never edit unitPrice on an old batch to
// reflect a new price, just create a new batch. rawMaterialName is a
// snapshot (same pattern as Payout) so a later rename doesn't rewrite history.
@Entity()
export class MaterialBatch {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => RawMaterial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rawMaterialId' })
  rawMaterial!: RawMaterial;

  @Column()
  rawMaterialId!: number;

  @Column()
  rawMaterialName!: string;

  // Snapshot of RawMaterial.unit at purchase time. Needed because names
  // aren't guaranteed unique -- e.g. two RawMaterial rows can both be named
  // "Poly" and only differ by unit ("piece" vs "yard"). Nullable so adding
  // this column doesn't break existing rows; backfilled via the
  // backfill:material-units script for batches created before this existed.
  @Column({ nullable: true })
  rawMaterialUnit?: string;

  @Column('float')
  quantityPurchased!: number;

  // What was paid per unit *this* batch -- can differ purchase to purchase.
  @Column('float')
  unitPrice!: number;

  // quantityPurchased * unitPrice, stored at write time.
  @Column('float')
  totalCost!: number;

  // Starts equal to quantityPurchased, decremented by MaterialConsumption
  // (FIFO: oldest batch with remaining > 0 gets drawn from first).
  @Column('float')
  quantityRemaining!: number;

  @Column({ type: 'date', nullable: true })
  purchaseDate?: string;

  // Set only when this batch was auto-created by a wood-processing entry's
  // final-stage output mirroring into RawMaterial/MaterialBatch (see
  // WoodProcessingService) -- lets that entry's edit/delete find and reverse
  // exactly this batch. Null for a batch entered directly on this page.
  @Column({ nullable: true })
  sourceWoodProcessingEntryId?: number;

  @CreateDateColumn()
  createdAt!: Date;
}
