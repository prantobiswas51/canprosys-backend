import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialConsumptionsController } from './material-consumptions.controller';
import { MaterialConsumptionsService } from './material-consumptions.service';
import { MaterialConsumption } from './material-consumption.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { RawMaterialsModule } from '../raw-materials/raw-materials.module';
import { WoodProcessingModule } from '../wood-processing/wood-processing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaterialConsumption, MaterialBatch]),
    RawMaterialsModule,
    WoodProcessingModule,
  ],
  controllers: [MaterialConsumptionsController],
  providers: [MaterialConsumptionsService],
  exports: [MaterialConsumptionsService],
})
export class MaterialConsumptionsModule {}
