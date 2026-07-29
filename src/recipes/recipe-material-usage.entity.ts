import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Recipe } from './recipe.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';

// Pivot table: which raw materials a recipe's BOM uses, and how much of
// each is needed per unit produced -- replaces the old hardcoded
// woodKg / boardSheet / screwAndHinges / polyBagType / polyBagQuantity
// columns on Recipe, which only covered exactly those 4 materials and
// resolved them to a RawMaterial row by fuzzy name+unit matching. This
// links directly to a specific RawMaterial by id instead, so any material
// (and any number of them) can be added, and there's no more guessing.
@Entity()
export class RecipeMaterialUsage {
  @PrimaryGeneratedColumn()
  id!: number;

  // Deleting a recipe should take its BOM rows with it -- nothing else
  // references them.
  @ManyToOne(() => Recipe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipeId' })
  recipe!: Recipe;

  @Column()
  recipeId!: number;

  // No onDelete cascade here on purpose -- deleting a RawMaterial that's
  // still used in a recipe's BOM should fail loudly (see
  // raw-materials.service.ts's isForeignKeyViolation handling), not silently
  // strip it out of every recipe that depends on it.
  @ManyToOne(() => RawMaterial)
  @JoinColumn({ name: 'rawMaterialId' })
  rawMaterial!: RawMaterial;

  @Column()
  rawMaterialId!: number;

  // Snapshots of RawMaterial.name/unit at the time this row was set --
  // same pattern as MaterialBatch.rawMaterialName/rawMaterialUnit, so a
  // later rename doesn't retroactively relabel history, and unit is shown
  // in the UI ("Poly (yard)") without an extra join. The *current* values
  // are always available via the `rawMaterial` relation when needed.
  @Column()
  rawMaterialName!: string;

  @Column()
  rawMaterialUnit!: string;

  // How much of this raw material one unit of the recipe's output consumes
  // -- e.g. 2 (kg) of Wood, 3 (piece) of Board, 3 (yard) of Poly. Multiplied
  // by the daily entry's weightKg to get the actual amount deducted via
  // FIFO from material_batch.
  @Column('float')
  quantity!: number;
}
