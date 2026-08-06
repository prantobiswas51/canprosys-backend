import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WoodStagesService } from './wood-stages.service';
import type { CreateWoodStageInput, UpdateWoodStageInput } from './wood-stages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('wood-stages')
export class WoodStagesController {
  constructor(private woodStagesService: WoodStagesService) {}

  @Get()
  getWoodStages() {
    return this.woodStagesService.getWoodStages();
  }

  @Post()
  createWoodStage(@Body() body: CreateWoodStageInput) {
    return this.woodStagesService.createWoodStage(body);
  }

  @Patch(':id')
  updateWoodStage(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateWoodStageInput) {
    return this.woodStagesService.updateWoodStage(id, body);
  }

  @Delete(':id')
  deleteWoodStage(@Param('id', ParseIntPipe) id: number) {
    return this.woodStagesService.deleteWoodStage(id);
  }
}
