import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

// A cash advance given to an employee against future wages. Recording one
// immediately debits Employee.balance (see LoansService.createLoan) so the
// balance always reflects the net amount owed between company and employee.
@Entity()
export class Loan {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee!: Employee;

  @Column()
  employeeId!: number;

  // Snapshot -- a later employee rename shouldn't retroactively alter a
  // loan record that's already been given.
  @Column()
  employeeName!: string;

  @Column('float')
  amount!: number;

  // The date the loan was actually handed over -- settable by the manager,
  // not just "whenever this row was saved".
  @Column('date')
  givenDate!: string;

  // YYYY-MM, derived from givenDate at creation time -- lets the frontend
  // filter "loans taken during the month" with a plain indexed match
  // instead of a date-range query.
  @Column()
  periodMonth!: string;

  @Column({ nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
