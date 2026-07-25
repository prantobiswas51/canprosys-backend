import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('payouts')
export class PayoutsController {
  constructor(private payoutsService: PayoutsService) {}

  // Computes payouts from daily entries for the given month and saves them
  // as independent rows -- safe to call again for the same month, already
  // -generated (dailyEntryId, employeeId) pairs are skipped.
  @Post('generate')
  generate(@Body() body: { month: string }) {
    return this.payoutsService.generatePayouts(body.month);
  }

  // Per-employee totals for a month -- what the frontend table renders.
  @Get('summary')
  getSummary(@Query('month') month: string) {
    return this.payoutsService.getPayoutSummary(month);
  }

  // Raw rows, optionally filtered by month -- for an audit/detail view later.
  @Get()
  getAll(@Query('month') month?: string) {
    return this.payoutsService.getPayouts(month);
  }
}
