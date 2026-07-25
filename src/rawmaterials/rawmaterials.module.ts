import { Module } from '@nestjs/common';
import { RawmaterialsService } from './rawmaterials.service';

@Module({
  providers: [RawmaterialsService]
})
export class RawmaterialsModule {}
