import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Employee, EmployeeStatus, NidStatus } from './employee.entity';
import { isUniqueViolation } from '../common/is-unique-violation';

export interface CreateEmployeeInput {
  name: string;
  phone?: string;
  status?: EmployeeStatus;
  pin?: number;
  managerId?: number;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
  ) {}

  // search matches name OR phone, case-insensitive, regardless of status --
  // an inactive employee should still be findable (e.g. to reactivate them
  // or look up their history), just not assignable to new work.
  async getEmployees(search?: string) {
    const trimmed = search?.trim();
    if (!trimmed) {
      return this.employeeRepository.find({ relations: { manager: true } });
    }

    return this.employeeRepository.find({
      where: [{ name: ILike(`%${trimmed}%`) }, { phone: ILike(`%${trimmed}%`) }],
      relations: { manager: true },
    });
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

  createEmployee(data: CreateEmployeeInput) {
    const employee = this.employeeRepository.create(data);
    return this.saveEmployee(employee);
  }

  async updateEmployee(id: number, data: UpdateEmployeeInput) {
    const employee = await this.getEmployeeById(id);
    Object.assign(employee, data);
    return this.saveEmployee(employee);
  }

  async deleteEmployee(id: number) {
    const employee = await this.getEmployeeById(id);
    await this.employeeRepository.remove(employee);
    return { deleted: true };
  }

  // Saves whichever NID image path(s) were just uploaded (front, back, or
  // both -- the controller only passes what multer actually received).
  // Every upload resets status back to pending, even a re-upload replacing
  // an already-approved image -- an approval was given against specific
  // pictures, so new ones need a fresh look rather than inheriting it.
  async uploadNidImages(id: number, images: { nidFrontImage?: string; nidBackImage?: string }) {
    const employee = await this.getEmployeeById(id);
    if (images.nidFrontImage) employee.nidFrontImage = images.nidFrontImage;
    if (images.nidBackImage) employee.nidBackImage = images.nidBackImage;
    employee.nidStatus = NidStatus.PENDING;
    return this.saveEmployee(employee);
  }

  async setNidStatus(id: number, status: NidStatus) {
    if (status !== NidStatus.APPROVED && status !== NidStatus.REJECTED) {
      throw new BadRequestException('Status must be "approved" or "rejected"');
    }
    const employee = await this.getEmployeeById(id);
    if (!employee.nidFrontImage && !employee.nidBackImage) {
      throw new BadRequestException(
        'Upload at least one NID image before it can be approved or rejected.',
      );
    }
    employee.nidStatus = status;
    return this.saveEmployee(employee);
  }

  // Postgres unique-violation (phone already registered to another
  // employee) surfaces as a raw QueryFailedError -- catch it and rethrow as
  // a proper 409 with a message the frontend can show, instead of an opaque
  // 500.
  private async saveEmployee(employee: Employee) {
    try {
      return await this.employeeRepository.save(employee);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Phone number "${employee.phone}" is already in use by another employee.`,
        );
      }
      throw err;
    }
  }

}
