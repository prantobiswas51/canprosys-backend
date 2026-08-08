import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MaintenanceCategory } from './maintenance-category.entity';

// One row per factory operating expense -- electricity bill, internet
// bill, snacks & meals, generator fuel, repairs, whatever category it's
// logged against. Deliberately separate from RawMaterial/Payout -- this is
// pure overhead, not tied to any product or employee's wages.
@Entity()
export class MaintenanceCost {
  @PrimaryGeneratedColumn()
  id!: number;

  // No onDelete cascade on purpose -- deleting a category that still has
  // cost entries logged against it should fail loudly (see
  // MaintenanceCategoriesService's FK-violation guard), not silently wipe
  // out that spending history.
  @ManyToOne(() => MaintenanceCategory)
  @JoinColumn({ name: 'categoryId' })
  category!: MaintenanceCategory;

  @Column()
  categoryId!: number;

  // Snapshots of the category at log time -- same pattern as
  // Payout.taskName, MaterialBatch.rawMaterialName, etc. -- so a later
  // rename/re-icon doesn't retroactively relabel history.
  @Column()
  categoryName!: string;

  @Column()
  categoryIcon!: string;

  @Column('float')
  amount!: number;

  @Column({ type: 'date' })
  costDate!: string;

  @Column({ nullable: true })
  remarks?: string;

  // Who logged it -- stamped server-side from the authenticated user
  // (req.user.name), not something the frontend sends.
  @Column({ nullable: true })
  loggedByName?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
