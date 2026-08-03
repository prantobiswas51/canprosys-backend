import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { LoansService } from './loans.service';
import type { CreateLoanInput } from './loans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('loans')
export class LoansController {
  constructor(private loansService: LoansService) {}

  @Post()
  create(@Body() body: CreateLoanInput) {
    return this.loansService.createLoan(body);
  }

  @Get()
  getAll(@Query('month') month?: string, @Query('employeeId') employeeId?: string) {
    return this.loansService.getLoans(month, employeeId ? Number(employeeId) : undefined);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.loansService.deleteLoan(id);
  }
}
