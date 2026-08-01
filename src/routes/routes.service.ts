import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Route } from './route.entity';

export interface CreateRouteInput {
  origin: string;
  destination: string;
  distanceKm?: number;
  estimatedCost?: number;
}

export type UpdateRouteInput = Partial<CreateRouteInput>;

@Injectable()
export class RoutesService {
  constructor(
    @InjectRepository(Route)
    private routeRepository: Repository<Route>,
  ) {}

  getRoutes() {
    return this.routeRepository.find();
  }

  async getRouteById(id: number) {
    const route = await this.routeRepository.findOneBy({ id });
    if (!route) {
      throw new NotFoundException(`Route #${id} not found`);
    }
    return route;
  }

  createRoute(data: CreateRouteInput) {
    const route = this.routeRepository.create(data);
    return this.routeRepository.save(route);
  }

  async updateRoute(id: number, data: UpdateRouteInput) {
    const route = await this.getRouteById(id);
    Object.assign(route, data);
    return this.routeRepository.save(route);
  }

  async deleteRoute(id: number) {
    const route = await this.getRouteById(id);
    try {
      await this.routeRepository.remove(route);
    } catch (err) {
      if (this.isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${route.origin} -> ${route.destination}" -- it's referenced by an existing shipment. Remove that first.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }

  private isForeignKeyViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === '23503'
    );
  }
}
