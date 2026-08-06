import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { WoodProcessingService } from './wood-processing.service';
import type { CreateWoodProcessingEntryInput } from './wood-processing.service';
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
}
