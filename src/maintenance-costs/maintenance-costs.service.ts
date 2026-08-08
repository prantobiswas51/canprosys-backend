import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MaintenanceCost } from './maintenance-cost.entity';
import { MaintenanceCategoriesService } from './maintenance-categories.service';

export interface CreateMaintenanceCostInput {
  categoryId: number;
  amount: number;
  costDate?: string; // YYYY-MM-DD, defaults to today
  remarks?: string;
}

@Injectable()
export class MaintenanceCostsService {
  constructor(
    @InjectRepository(MaintenanceCost)
    private costRepository: Repository<MaintenanceCost>,
    private categoriesService: MaintenanceCategoriesService,
  ) {}

  // month is an optional 'YYYY-MM' filter on costDate. costDate is a Postgres
  // `date` column, which has no LIKE/~~ operator against a text parameter --
  // so filter with a Between() range instead, matching the pattern used in
  // LoansService/WasteBatchesService/WasteSalesService elsewhere.
  getCosts(month?: string) {
    if (month) {
      const [year, mon] = month.split('-').map(Number);
      const from = `${month}-01`;
      const lastDay = new Date(year, mon, 0).getDate(); // day 0 of next month = last day of this month
      const to = `${month}-${String(lastDay).padStart(2, '0')}`;
      return this.costRepository.find({
        where: { costDate: Between(from, to) },
        order: { costDate: 'DESC', id: 'DESC' },
      });
    }
    return this.costRepository.find({ order: { costDate: 'DESC', id: 'DESC' } });
  }

  async createCost(data: CreateMaintenanceCostInput, loggedByName?: string) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    const category = await this.categoriesService.getCategoryById(data.categoryId);

    const cost = this.costRepository.create({
      categoryId: category.id,
      categoryName: category.name,
      categoryIcon: category.icon,
      amount: data.amount,
      costDate: data.costDate || new Date().toISOString().slice(0, 10),
      remarks: data.remarks,
      loggedByName,
    });
    return this.costRepository.save(cost);
  }

  async deleteCost(id: number) {
    const cost = await this.costRepository.findOneBy({ id });
    if (!cost) {
      throw new NotFoundException(`Maintenance cost #${id} not found`);
    }
    await this.costRepository.remove(cost);
    return { deleted: true };
  }
}
