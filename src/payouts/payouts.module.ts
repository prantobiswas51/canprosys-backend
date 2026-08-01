import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { Payout } from './payout.entity';
import { DailyEntry } from '../daily-entry/daily-entry.entity';
import { Employee } from '../employees/employee.entity';
import { RecipeTaskRate } from '../recipes/recipe-task-rate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payout, DailyEntry, Employee, RecipeTaskRate])],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
