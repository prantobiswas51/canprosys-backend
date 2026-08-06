import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WasteType } from './waste-type.entity';
import { WasteBatch } from './waste-batch.entity';
import { WasteSale } from './waste-sale.entity';
import { WasteTypesService } from './waste-types.service';
import { WasteTypesController } from './waste-types.controller';
import { WasteBatchesService } from './waste-batches.service';
import { WasteBatchesController } from './waste-batches.controller';
import { WasteSalesService } from './waste-sales.service';
import { WasteSalesController } from './waste-sales.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WasteType, WasteBatch, WasteSale])],
  controllers: [WasteTypesController, WasteBatchesController, WasteSalesController],
  providers: [WasteTypesService, WasteBatchesService, WasteSalesService],
  // WoodProcessingModule uses WasteBatchesService directly to auto-create a
  // waste batch whenever a processing entry reports waste -- exported so it
  // doesn't have to duplicate that logic.
  exports: [WasteTypesService, WasteBatchesService, WasteSalesService],
})
export class WasteManagementModule {}
