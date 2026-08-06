import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WoodType } from './wood-type.entity';
import { WoodStage } from './wood-stage.entity';
import { WoodStockBatch } from './wood-stock-batch.entity';
import { WoodProcessingConsumption } from './wood-processing-consumption.entity';
import { WoodProcessingEntry } from './wood-processing-entry.entity';
import { Employee } from '../employees/employee.entity';
import { Payout } from '../payouts/payout.entity';
import { WoodTypesService } from './wood-types.service';
import { WoodTypesController } from './wood-types.controller';
import { WoodStagesService } from './wood-stages.service';
import { WoodStagesController } from './wood-stages.controller';
import { WoodStockService } from './wood-stock.service';
import { WoodStockController } from './wood-stock.controller';
import { WoodProcessingService } from './wood-processing.service';
import { WoodProcessingController } from './wood-processing.controller';
import { RawMaterialsModule } from '../raw-materials/raw-materials.module';
import { WasteManagementModule } from '../waste-management/waste-management.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WoodType,
      WoodStage,
      WoodStockBatch,
      WoodProcessingConsumption,
      WoodProcessingEntry,
      Employee,
      Payout,
    ]),
    RawMaterialsModule,
    WasteManagementModule,
  ],
  controllers: [WoodTypesController, WoodStagesController, WoodStockController, WoodProcessingController],
  providers: [WoodTypesService, WoodStagesService, WoodStockService, WoodProcessingService],
  exports: [WoodTypesService, WoodStagesService, WoodStockService, WoodProcessingService],
})
export class WoodProcessingModule {}
