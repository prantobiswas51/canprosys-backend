import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

@Entity()
export class Task {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    name!: string;

    @Column()
    slug!: string;

    // Nullable -- not every task pays a per-unit piece rate (e.g. salaried
    // or non-production tasks). When null, no Payout rows are generated for
    // entries logged against this task -- see payouts.service.ts.
    @Column('float', { nullable: true })
    pricePerUnit?: number | null;

    // Whether the Daily Entry form needs a Product (recipe) selected for
    // this task. False for raw-material prep steps that happen before a
    // specific product is chosen (Wood Slicing, Corner Cutting) -- true for
    // everything else. Default true, editable on the Tasks page; replaces
    // what used to be a hardcoded slug list in daily-entry.service.ts.
    @Column({ default: true })
    requiresProduct!: boolean;
}