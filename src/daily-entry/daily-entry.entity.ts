import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  CreateDateColumn,
} from 'typeorm';
import { Task } from '../tasks/task.entity';
import { Employee } from '../employees/employee.entity';

@Entity()
export class DailyEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Task)
  @JoinColumn({ name: 'taskId' })
  task!: Task;

  @Column()
  taskId!: number;

  // Single OR multiple artisans on one entry -- many-to-many even though
  // most entries will likely only have one.
  @ManyToMany(() => Employee)
  @JoinTable({
    name: 'daily_entry_employees',
    joinColumn: { name: 'dailyEntryId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employeeId', referencedColumnName: 'id' },
  })
  employees!: Employee[];

  @Column('float')
  weightKg!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
