
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Product {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    name!: string;

    @Column()
    sku!: string;

    // Explicit 'float' -- without it TypeORM infers plain `number` design
    // types as Postgres `integer`, which throws on any decimal value (e.g.
    // a recipe's live-computed cost like 49.999).
    @Column('float')
    costPrice!: number;

    @Column('float')
    stock!: number;

    // What this product actually sells for -- set manually per product
    // (costPrice is computed live from its recipe, this isn't). Nullable
    // since a product may exist before anyone's set a sell price for it yet;
    // treated as "unknown" (not ৳0) everywhere it's used for profit math.
    @Column('float', { nullable: true })
    sellPrice?: number | null;
}