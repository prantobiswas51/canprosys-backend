import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ProductsModule } from '../products/products.module';
import { RecipesModule } from '../recipes/recipes.module';
import { EmployeesModule } from '../employees/employees.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { MaterialBatchesModule } from '../material-batches/material-batches.module';
import { WasteManagementModule } from '../waste-management/waste-management.module';
import { WoodProcessingModule } from '../wood-processing/wood-processing.module';

@Module({
  imports: [
    ProductsModule,
    RecipesModule,
    EmployeesModule,
    PayoutsModule,
    MaterialBatchesModule,
    WasteManagementModule,
    WoodProcessingModule,
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
