import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { MaterialMixesService } from './material-mixes.service';
import type { CreateMaterialMixInput, CreateAutoMaterialMixInput } from './material-mixes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('material-mixes')
export class MaterialMixesController {
  constructor(private mixesService: MaterialMixesService) {}

  @Get()
  getMixes() {
    return this.mixesService.getMixes();
  }

  @Post()
  createMix(@Body() body: CreateMaterialMixInput) {
    return this.mixesService.createMix(body);
  }

  // Ratio-driven: consumes as much of A and B as currently exists, at the
  // given ratio -- see MaterialMixesService.createAutoMix. Declared before
  // the plain POST is fine since this is its own path, not a param route.
  @Post('auto')
  createAutoMix(@Body() body: CreateAutoMaterialMixInput) {
    return this.mixesService.createAutoMix(body);
  }

  @Delete(':id')
  deleteMix(@Param('id', ParseIntPipe) id: number) {
    return this.mixesService.deleteMix(id);
  }
}
