import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialMixesController } from './material-mixes.controller';
import { MaterialMixesService } from './material-mixes.service';
import { MaterialMix } from './material-mix.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { RawMaterialsModule } from '../raw-materials/raw-materials.module';
import { MaterialConsumptionsModule } from '../material-consumptions/material-consumptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaterialMix, MaterialBatch]),
    RawMaterialsModule,
    MaterialConsumptionsModule,
  ],
  controllers: [MaterialMixesController],
  providers: [MaterialMixesService],
})
export class MaterialMixesModule {}
