import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomOrder } from './custom-order.entity';
import { CustomOrdersService } from './custom-orders.service';
import { CustomOrdersController } from './custom-orders.controller';
import { MaterialConsumptionsModule } from '../material-consumptions/material-consumptions.module';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [TypeOrmModule.forFeature([CustomOrder]), MaterialConsumptionsModule, PayoutsModule],
  controllers: [CustomOrdersController],
  providers: [CustomOrdersService],
  exports: [CustomOrdersService],
})
export class CustomOrdersModule {}
