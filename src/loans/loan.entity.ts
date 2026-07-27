import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Employee } from '../employees/employee.entity';


@Entity()
export class Loan {
    @PrimaryGeneratedColumn()
    id!: number;

    // fetch employee table here
    @ManyToOne(() => Employee)
    employee!: string;

    @Column()
    amount!: number;

    @Column()
    given_date!: Date;
}
