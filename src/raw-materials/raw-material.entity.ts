import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";


@Entity()
export class RawMaterial{
    @PrimaryGeneratedColumn()
    id!:number;

    @Column()
    name!:string;

    @Column()
    unit!:string;

    @Column({ unique: true })
    slug!: string;
}