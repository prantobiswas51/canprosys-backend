import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WoodType } from './wood-type.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { WasteType } from '../waste-management/waste-type.entity';

// One configurable step of the pipeline: consumes inputType, produces
// outputType. This is what replaces slug-based special-casing in
// daily-entry.service.ts -- adding a step (or a branch, like Normal Cut and
// Slant Cut both reading from the same sliced-wood stock) is a new row
// here, never a code change.
@Entity()
export class WoodStage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToOne(() => WoodType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inputTypeId' })
  inputType!: WoodType;

  @Column()
  inputTypeId!: number;

  @ManyToOne(() => WoodType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'outputTypeId' })
  outputType!: WoodType;

  @Column()
  outputTypeId!: number;

  // Paid per unit of weight taken from the input stock BEFORE processing
  // (good output + waste combined) -- not per unit of good output alone.
  // Flat for every artisan; editable here at any time. Each entry snapshots
  // the rate it actually used (see WoodProcessingEntry), so a later rate
  // change never retroactively rewrites a past payout.
  @Column('float')
  wageRatePerUnit!: number;

  // Display ordering only (raw -> sliced -> cut...), not enforced.
  @Column({ default: 0 })
  sequence!: number;

  // Set only on the final step(s) of a branch -- e.g. the two "cut the
  // corner" stages that each produce one of the two finished wood
  // products. When set, WoodProcessingService also mirrors the produced
  // batch into RawMaterial/MaterialBatch under this id, so Packaging's BOM
  // consumption (which only knows about RawMaterial) can keep consuming it
  // exactly like any other purchased material.
  @ManyToOne(() => RawMaterial, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'mirrorToRawMaterialId' })
  mirrorToRawMaterial?: RawMaterial;

  @Column({ nullable: true })
  mirrorToRawMaterialId?: number;

  // What kind of waste this stage's leftover material counts as (e.g.
  // "Wood Shavings" for a slicing stage) -- used as the default when a
  // processing entry against this stage reports wasteQuantity > 0.
  // Overridable per entry. Not required for stages that never produce
  // waste worth tracking.
  @ManyToOne(() => WasteType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultWasteTypeId' })
  defaultWasteType?: WasteType;

  @Column({ nullable: true })
  defaultWasteTypeId?: number;

  @Column({ default: true })
  active!: boolean;
}
