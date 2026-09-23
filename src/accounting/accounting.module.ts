import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { MaintenanceCostsModule } from '../maintenance-costs/maintenance-costs.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { MaterialConsumptionsModule } from '../material-consumptions/material-consumptions.module';
import { ProductsModule } from '../products/products.module';
import { WasteManagementModule } from '../waste-management/waste-management.module';

// Read-only rollup module -- doesn't own any entity of its own, just
// composes totals from the modules that do (maintenance costs, payouts,
// material consumption, finished-goods products, waste sales).
@Module({
  imports: [MaintenanceCostsModule, PayoutsModule, MaterialConsumptionsModule, ProductsModule, WasteManagementModule],
  controllers: [AccountingController],
  providers: [AccountingService],
})
export class AccountingModule {}
