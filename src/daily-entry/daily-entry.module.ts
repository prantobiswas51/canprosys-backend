import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyEntryController } from './daily-entry.controller';
import { DailyEntryService } from './daily-entry.service';
import { DailyEntry } from './daily-entry.entity';
import { Task } from '../tasks/task.entity';
import { Employee } from '../employees/employee.entity';
import { Recipe } from '../recipes/recipe.entity';
import { Product } from '../products/product.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { PayoutsModule } from '../payouts/payouts.module';
import { MaterialConsumptionsModule } from '../material-consumptions/material-consumptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyEntry, Task, Employee, Recipe, Product, RawMaterial]),
    PayoutsModule,
    MaterialConsumptionsModule,
  ],
  controllers: [DailyEntryController],
  providers: [DailyEntryService],
})
export class DailyEntryModule {}
