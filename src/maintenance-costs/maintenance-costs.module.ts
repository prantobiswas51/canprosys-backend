import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceCategory } from './maintenance-category.entity';
import { MaintenanceCost } from './maintenance-cost.entity';
import { MaintenanceCategoriesService } from './maintenance-categories.service';
import { MaintenanceCategoriesController } from './maintenance-categories.controller';
import { MaintenanceCostsService } from './maintenance-costs.service';
import { MaintenanceCostsController } from './maintenance-costs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MaintenanceCategory, MaintenanceCost])],
  controllers: [MaintenanceCategoriesController, MaintenanceCostsController],
  providers: [MaintenanceCategoriesService, MaintenanceCostsService],
  exports: [MaintenanceCategoriesService, MaintenanceCostsService],
})
export class MaintenanceCostsModule {}
