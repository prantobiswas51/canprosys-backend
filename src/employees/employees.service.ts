import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeeStatus } from './employee.entity';

export interface CreateEmployeeInput {
  name: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
  status?: EmployeeStatus;
  managerId?: number;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
  ) {}

  async getEmployees() {
    return this.employeeRepository.find({ relations: { manager: true } });
  }

  async getEmployeeById(id: number) {
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: { manager: true },
    });

    if (!employee) {
      throw new NotFoundException(`Employee #${id} not found`);
    }

    return employee;
  }

  async createEmployee(data: CreateEmployeeInput) {
    const employee = this.employeeRepository.create(data);
    return this.employeeRepository.save(employee);
  }

  async updateEmployee(id: number, data: UpdateEmployeeInput) {
    const employee = await this.getEmployeeById(id);
    Object.assign(employee, data);
    return this.employeeRepository.save(employee);
  }

  async deleteEmployee(id: number) {
    const employee = await this.getEmployeeById(id);
    await this.employeeRepository.remove(employee);
    return { deleted: true };
  }
}
