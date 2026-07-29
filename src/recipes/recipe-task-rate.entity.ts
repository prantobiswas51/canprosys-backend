import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Recipe } from './recipe.entity';
import { Task } from '../tasks/task.entity';

// Pivot table: which tasks apply to a given recipe, and what that recipe
// pays per unit for each one -- replaces the old hardcoded frameMakingRate /
// clothSheetFittingRate / boardFittingRate / packagingRate columns on Recipe,
// since not every recipe uses the same set of tasks (a simple product might
// only need Packaging; a framed one needs Frame Making + Cloth Fitting too).
@Entity()
export class RecipeTaskRate {
  @PrimaryGeneratedColumn()
  id!: number;

  // Deleting a recipe should take its wage rows with it -- nothing else
  // references them.
  @ManyToOne(() => Recipe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipeId' })
  recipe!: Recipe;

  @Column()
  recipeId!: number;

  // No onDelete cascade here on purpose -- deleting a Task that's still used
  // by a recipe's wage table should fail loudly (see tasks.service.ts's
  // isForeignKeyViolation handling), not silently wipe out that recipe's
  // wage setup.
  @ManyToOne(() => Task)
  @JoinColumn({ name: 'taskId' })
  task!: Task;

  @Column()
  taskId!: number;

  // Snapshot of Task.name at the time this row was set, same pattern as
  // Payout.employeeName / MaterialBatch.rawMaterialName -- so a later task
  // rename doesn't retroactively relabel history. The *current* name is
  // always available via the `task` relation when needed.
  @Column()
  taskName!: string;

  @Column('float')
  rate!: number;
}
