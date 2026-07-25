import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { Payout } from './payout.entity';
import { DailyEntry } from '../daily-entry/daily-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payout, DailyEntry])],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
