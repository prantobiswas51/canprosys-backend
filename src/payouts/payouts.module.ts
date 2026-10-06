import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { Payout } from './payout.entity';
import { DailyEntry } from '../daily-entry/daily-entry.entity';
import { Employee } from '../employees/employee.entity';
import { RecipeTaskRate } from '../recipes/recipe-task-rate.entity';
import { Task } from '../tasks/task.entity';
import { Loan } from '../loans/loan.entity';
import { PayoutSettlement } from './payout-settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout, PayoutSettlement, DailyEntry, Employee, RecipeTaskRate, Task, Loan]),
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
