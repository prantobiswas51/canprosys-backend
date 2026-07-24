import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DailyEntryService } from './daily-entry.service';
import type { CreateDailyEntryInput } from './daily-entry.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('daily-entries')
export class DailyEntryController {
  constructor(private dailyEntryService: DailyEntryService) {}

  @Get()
  getEntries() {
    return this.dailyEntryService.getEntries();
  }

  @Post()
  createEntry(@Body() body: CreateDailyEntryInput) {
    return this.dailyEntryService.createEntry(body);
  }
}
