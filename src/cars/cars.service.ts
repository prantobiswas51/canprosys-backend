import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Car, CarStatus } from './car.entity';

export interface CreateCarInput {
  plateNumber: string;
  model: string;
  capacityKg: number;
  status?: CarStatus;
}

export type UpdateCarInput = Partial<CreateCarInput>;

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Car)
    private carRepository: Repository<Car>,
  ) {}

  getCars() {
    return this.carRepository.find();
  }

  async getCarById(id: number) {
    const car = await this.carRepository.findOneBy({ id });
    if (!car) {
      throw new NotFoundException(`Car #${id} not found`);
    }
    return car;
  }

  createCar(data: CreateCarInput) {
    const car = this.carRepository.create(data);
    return this.saveCar(car);
  }

  async updateCar(id: number, data: UpdateCarInput) {
    const car = await this.getCarById(id);
    Object.assign(car, data);
    return this.saveCar(car);
  }

  async deleteCar(id: number) {
    const car = await this.getCarById(id);
    try {
      await this.carRepository.remove(car);
    } catch (err) {
      if (this.isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${car.plateNumber}" -- it's referenced by an existing shipment. Remove that first.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }

  // Postgres unique-violation (plate number already exists) surfaces as a
  // raw QueryFailedError -- catch it and rethrow as a proper 409 with a
  // message the frontend can show, instead of an opaque 500.
  private async saveCar(car: Car) {
    try {
      return await this.carRepository.save(car);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(`Plate number "${car.plateNumber}" is already in use by another car.`);
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
