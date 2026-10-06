import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

// "This employee has been paid for this month" -- one row per (employee,
// month), created by the Paid button on the Payouts page. wages/loans/amount
// are a snapshot of what was actually handed over at that moment, so the
// record still reads correctly even if more payouts or loans get logged for
// that month afterwards.
@Entity()
@Unique(['employeeId', 'periodMonth'])
export class PayoutSettlement {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee!: Employee;

  @Column()
  employeeId!: number;

  @Column()
  employeeName!: string;

  // YYYY-MM
  @Column()
  periodMonth!: string;

  @Column('float')
  wages!: number;

  @Column('float')
  loans!: number;

  // wages - loans: the cash actually paid out.
  @Column('float')
  amount!: number;

  @CreateDateColumn()
  paidAt!: Date;
}
