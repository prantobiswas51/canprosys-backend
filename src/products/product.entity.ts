
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Product {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    name!: string;

    @Column()
    sku!: string;

    @Column()
    costPrice!: number;

    @Column()
    stock!: number;
}