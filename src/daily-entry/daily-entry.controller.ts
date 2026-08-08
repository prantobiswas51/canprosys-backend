import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { DailyEntryService } from './daily-entry.service';
import type { CreateDailyEntryInput, UpdateDailyEntryInput } from './daily-entry.service';
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

  @Patch(':id')
  updateEntry(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateDailyEntryInput) {
    return this.dailyEntryService.updateEntry(id, body);
  }

  @Delete(':id')
  deleteEntry(@Param('id', ParseIntPipe) id: number) {
    return this.dailyEntryService.deleteEntry(id);
  }
}
