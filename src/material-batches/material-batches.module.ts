import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialBatchesController } from './material-batches.controller';
import { MaterialBatchesService } from './material-batches.service';
import { MaterialBatch } from './material-batch.entity';
import { RawMaterialsModule } from '../raw-materials/raw-materials.module';
import { MaterialMixesModule } from '../material-mixes/material-mixes.module';

@Module({
  imports: [TypeOrmModule.forFeature([MaterialBatch]), RawMaterialsModule, MaterialMixesModule],
  controllers: [MaterialBatchesController],
  providers: [MaterialBatchesService],
  exports: [MaterialBatchesService],
})
export class MaterialBatchesModule {}
