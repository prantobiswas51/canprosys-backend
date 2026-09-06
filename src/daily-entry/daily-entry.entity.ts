import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  CreateDateColumn,
} from 'typeorm';
import { Task } from '../tasks/task.entity';
import { Employee } from '../employees/employee.entity';
import { Recipe } from '../recipes/recipe.entity';

@Entity()
export class DailyEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Task)
  @JoinColumn({ name: 'taskId' })
  task!: Task;

  @Column()
  taskId!: number;

  // Single OR multiple artisans on one entry -- many-to-many even though
  // most entries will likely only have one.
  @ManyToMany(() => Employee)
  @JoinTable({
    name: 'daily_entry_employees',
    joinColumn: { name: 'dailyEntryId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employeeId', referencedColumnName: 'id' },
  })
  employees!: Employee[];

  @Column('float')
  weightKg!: number;

  // Which recipe (product + size, from the BOM table) this entry's work was
  // for. Not applicable to raw material prep tasks (Wood Slicing, Corner
  // Cutting) since those happen before a product is chosen -- nullable for those.
  @ManyToOne(() => Recipe, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recipeId' })
  recipe?: Recipe;

  @Column({ nullable: true })
  recipeId?: number;

  // Snapshot of recipe.product at entry time (same pattern as Payout) so a
  // later recipe rename/deletion doesn't retroactively change this record.
  @Column({ nullable: true })
  productName?: string;

  // Snapshot of what this entry actually did to the stage ledger at the
  // time it was created -- stored explicitly rather than re-derived from
  // the recipe's *current* sequence/task config, since that can change
  // later (a stage added, reordered, etc.) and reversal must undo exactly
  // what this entry did, not whatever the recipe's pipeline looks like now.
  // All null/false for entries created before per-stage tracking existed;
  // reverseEntrySideEffects falls back to the old Packaging-slug check for
  // those (see DailyEntryService).
  @Column({ nullable: true })
  consumedFromTaskId?: number;

  @Column({ nullable: true })
  creditedStageTaskId?: number;

  @Column({ default: false })
  creditedProductStock!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
