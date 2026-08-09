
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
}