import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A factory operating-expense category -- electricity, internet, snacks &
// meals, generator fuel, repairs, whatever the business actually spends on.
// Deliberately not seeded with any hardcoded set (same philosophy as
// WoodType/WoodStage) -- set up entirely through the Maintenance Costs
// page's "Add Cost Category" form.
@Entity()
export class MaintenanceCategory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  // FontAwesome class, e.g. "fa-bolt" (electricity), "fa-wifi" (internet),
  // "fa-utensils" (snacks & meals) -- freeform text, not a fixed picker, so
  // any icon works. Falls back to a generic money icon if left blank.
  @Column({ default: 'fa-money-bill-wave' })
  icon!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
