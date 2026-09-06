import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Recipe } from './recipe.entity';
import { Task } from '../tasks/task.entity';

// Running "how many pieces of this recipe are currently sitting after this
// stage, waiting for the next one" balance. One row per (recipe, task) --
// created the first time a Daily Entry is logged for that stage, then
// incremented/decremented from there. This is entirely generic: nothing
// here names a specific product or stage, it's driven purely by whatever
// recipes/tasks exist and how RecipeTaskRate.sequence orders them (see
// DailyEntryService, which is the only thing that writes to this table).
//
// Deliberately a single running balance, not a batch list like
// MaterialBatch/WoodStockBatch -- those exist to track differing cost per
// batch (different purchase prices), which doesn't apply here since a
// recipe's unit cost is always computed fresh from current material prices
// (see RecipesService.computeUnitCost), not from historical WIP batches.
@Entity()
@Unique(['recipeId', 'taskId'])
export class RecipeStageStock {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Recipe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipeId' })
  recipe!: Recipe;

  @Index()
  @Column()
  recipeId!: number;

  // No cascade -- unlike the recipe side, deleting a task that still has
  // real physical WIP sitting against it should fail loudly (same
  // isForeignKeyViolation handling as everywhere else), not silently erase
  // the count of actual pieces sitting on the factory floor.
  @ManyToOne(() => Task)
  @JoinColumn({ name: 'taskId' })
  task!: Task;

  @Column()
  taskId!: number;

  // Snapshot, same pattern as RecipeTaskRate.taskName -- so the UI can show
  // a label without an extra join, and a later task rename doesn't
  // retroactively relabel this row.
  @Column()
  taskName!: string;

  @Column('float', { default: 0 })
  quantity!: number;
}
