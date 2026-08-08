import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Loan } from './loan.entity';
import { Employee } from '../employees/employee.entity';

export interface CreateLoanInput {
  employeeId: number;
  amount: number;
  givenDate?: string; // YYYY-MM-DD, defaults to today
  note?: string;
}

export interface GetLoansFilter {
  month?: string;
  employeeId?: number;
  // Case-insensitive partial match on the employeeName snapshot -- lets the
  // frontend filter by typed name without needing to resolve an id first.
  employeeName?: string;
  // Date range on givenDate (both YYYY-MM-DD, inclusive). Takes priority
  // over month when both are somehow present.
  from?: string;
  to?: string;
}

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan) private loanRepository: Repository<Loan>,
    @InjectRepository(Employee) private employeeRepository: Repository<Employee>,
  ) {}

  async createLoan(data: CreateLoanInput) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('Loan amount must be greater than zero');
    }

    const employee = await this.employeeRepository.findOneBy({ id: data.employeeId });
    if (!employee) {
      throw new NotFoundException(`Employee #${data.employeeId} not found`);
    }

    const givenDate = data.givenDate || new Date().toISOString().slice(0, 10);
    const periodMonth = givenDate.slice(0, 7);

    return this.loanRepository.manager.transaction(async (manager) => {
      const loan = manager.create(Loan, {
        employeeId: employee.id,
        employeeName: employee.name,
        amount: data.amount,
        givenDate,
        periodMonth,
        note: data.note,
      });
      const saved = await manager.save(loan);

      // Debit the employee's running balance -- a loan is an advance
      // against wages, so it reduces what the company owes them (or puts
      // them in the negative if they've already been paid out in full).
      await manager.increment(Employee, { id: employee.id }, 'balance', -data.amount);

      return saved;
    });
  }

  getLoans(filter: GetLoansFilter = {}) {
    const where: FindOptionsWhere<Loan> = {};
    if (filter.employeeId != null) where.employeeId = filter.employeeId;
    if (filter.employeeName) where.employeeName = ILike(`%${filter.employeeName}%`);

    if (filter.from && filter.to) {
      where.givenDate = Between(filter.from, filter.to);
    } else if (filter.month) {
      where.periodMonth = filter.month;
    }

    return this.loanRepository.find({
      where,
      order: { givenDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async deleteLoan(id: number) {
    const loan = await this.loanRepository.findOneBy({ id });
    if (!loan) {
      throw new NotFoundException(`Loan #${id} not found`);
    }

    await this.loanRepository.manager.transaction(async (manager) => {
      await manager.remove(loan);
      // Undo the earlier debit -- deleting a mistaken loan record should
      // restore the balance it reduced.
      await manager.increment(Employee, { id: loan.employeeId }, 'balance', loan.amount);
    });

    return { deleted: true };
  }
}
