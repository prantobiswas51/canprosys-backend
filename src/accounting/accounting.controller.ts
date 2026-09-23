import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private accountingService: AccountingService) {}

  // GET /accounting/summary?month=2026-09 -- defaults to the current month.
  @Get('summary')
  getSummary(@Query('month') month?: string) {
    return this.accountingService.getMonthlySummary(month);
  }
}
