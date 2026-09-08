import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A simple named grouping for recipes/products (e.g. "Canvas", "Easel") --
// admin-managed via its own CRUD (see recipe-categories.service.ts), not a
// hardcoded enum, so new categories can be added later without a code
// change or redeploy. Same shape/philosophy as WasteType.
@Entity()
export class RecipeCategory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  // Whether recipes in this category go through a multi-stage production
  // pipeline (Frame Making -> Cloth Stretching -> Packaging, each with its
  // own WIP bucket and a required Step number) or finish in one step (any
  // configured task directly credits finished-goods stock, no Step numbers,
  // no per-stage WIP -- see DailyEntryService.resolveStagePositionForEntry).
  // Defaults true so existing categories/recipes keep today's behavior.
  @Column({ default: true })
  hasSteps!: boolean;
}
