import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A saved "combine A and B at this ratio into this output" config -- e.g.
// Color + Ayca at 9:1 -> Gesso. Once saved, recording a new purchase batch
// of either input (see MaterialBatchesService.createBatch) automatically
// runs MaterialMixesService.createAutoMix for it, so buying more Color or
// Ayca keeps Gesso topped up without a manual trip to the Material Mixing
// page. Admin-managed, not hardcoded -- same philosophy as RecipeCategory.
@Entity()
export class MixRecipe {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  materialAId!: number;

  @Column('float')
  ratioA!: number;

  @Column()
  materialBId!: number;

  @Column('float')
  ratioB!: number;

  @Column()
  outputMaterialId!: number;

  // Lets a recipe be paused without losing its configuration -- e.g. while
  // testing a different ratio, flip this off instead of deleting/recreating.
  // Auto-mix only ever looks at active=true recipes.
  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
