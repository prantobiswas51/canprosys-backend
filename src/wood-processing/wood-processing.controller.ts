import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { WoodProcessingService } from './wood-processing.service';
import type { CreateWoodProcessingEntryInput, UpdateWoodProcessingEntryInput } from './wood-processing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('wood-processing-entries')
export class WoodProcessingController {
  constructor(private woodProcessingService: WoodProcessingService) {}

  @Get()
  getEntries() {
    return this.woodProcessingService.getEntries();
  }

  @Post()
  createEntry(@Body() body: CreateWoodProcessingEntryInput) {
    return this.woodProcessingService.createEntry(body);
  }

  @Patch(':id')
  updateEntry(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateWoodProcessingEntryInput) {
    return this.woodProcessingService.updateEntry(id, body);
  }

  @Delete(':id')
  deleteEntry(@Param('id', ParseIntPipe) id: number) {
    return this.woodProcessingService.deleteEntry(id);
  }
}
