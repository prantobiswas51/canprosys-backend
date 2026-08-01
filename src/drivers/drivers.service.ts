import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Driver, DriverStatus } from './driver.entity';

export interface CreateDriverInput {
  name: string;
  phone?: string;
  licenseNumber?: string;
  status?: DriverStatus;
}

export type UpdateDriverInput = Partial<CreateDriverInput>;

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
  ) {}

  getDrivers() {
    return this.driverRepository.find();
  }

  async getDriverById(id: number) {
    const driver = await this.driverRepository.findOneBy({ id });
    if (!driver) {
      throw new NotFoundException(`Driver #${id} not found`);
    }
    return driver;
  }

  createDriver(data: CreateDriverInput) {
    const driver = this.driverRepository.create(data);
    return this.saveDriver(driver);
  }

  async updateDriver(id: number, data: UpdateDriverInput) {
    const driver = await this.getDriverById(id);
    Object.assign(driver, data);
    return this.saveDriver(driver);
  }

  async deleteDriver(id: number) {
    const driver = await this.getDriverById(id);
    try {
      await this.driverRepository.remove(driver);
    } catch (err) {
      if (this.isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${driver.name}" -- they're referenced by an existing shipment. Remove that first.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }

  // Postgres unique-violation (license number already exists) surfaces as a
  // raw QueryFailedError -- catch it and rethrow as a proper 409 with a
  // message the frontend can show, instead of an opaque 500.
  private async saveDriver(driver: Driver) {
    try {
      return await this.driverRepository.save(driver);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          `License number "${driver.licenseNumber}" is already in use by another driver.`,
        );
      }
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === '23505'
    );
  }

  private isForeignKeyViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === '23503'
    );
  }
}
