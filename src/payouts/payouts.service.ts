import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, Repository } from 'typeorm';
import { Payout } from './payout.entity';
import { DailyEntry } from '../daily-entry/daily-entry.entity';

export interface PayoutSummaryRow {
  employeeId: number;
  employeeName: string;
  totalWeight: number;
  entryCount: number;
  totalPayout: number;
}

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout) private payoutRepository: Repository<Payout>,
    @InjectRepository(DailyEntry) private dailyEntryRepository: Repository<DailyEntry>,
  ) {}

  // No 'Z' suffix -- parsed as local time, which is Asia/Dhaka since
  // process.env.TZ is forced to that in main.ts. Using 'Z' here would shift
  // month boundaries by 6 hours relative to Dhaka's actual calendar month.
  private monthRange(month: string) {
    const start = new Date(`${month}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  // Computes and saves the payout rows for a single daily entry -- one row
  // per artisan, weight split equally. Called automatically right after a
  // daily entry is saved (see DailyEntryService.createEntry), and also
  // reused by the batch generatePayouts() below for backfilling past months.
  // Idempotent: if this entry's payouts already exist (e.g. it was already
  // processed automatically), it's skipped rather than duplicated.
  //
  // Accepts an optional transaction `manager` -- when DailyEntryService calls
  // this from inside its own transaction, passing the manager through means
  // these payout writes commit/rollback together with the entry save instead
  // of being a separate, un-rollback-able write.
  async generatePayoutsForEntry(
    entry: DailyEntry,
    manager?: EntityManager,
  ): Promise<{ created: number; skipped: number }> {
    if (!entry.task || !entry.employees || entry.employees.length === 0) {
      return { created: 0, skipped: 0 };
    }

    const payoutRepository = manager ? manager.getRepository(Payout) : this.payoutRepository;

    const weightShare = entry.weightKg / entry.employees.length;
    const ratePerUnit = entry.task.pricePerUnit;
    const amount = weightShare * ratePerUnit;
    const periodMonth = entry.createdAt.toISOString().slice(0, 7);

    let created = 0;
    let skipped = 0;

    for (const employee of entry.employees) {
      const existing = await payoutRepository.findOneBy({
        dailyEntryId: entry.id,
        employeeId: employee.id,
      });
      if (existing) {
        skipped++;
        continue;
      }

      const payout = payoutRepository.create({
        employeeId: employee.id,
        employeeName: employee.name,
        taskId: entry.task.id,
        taskName: entry.task.name,
        dailyEntryId: entry.id,
        weightShare,
        ratePerUnit,
        amount,
        periodMonth,
      });
      await payoutRepository.save(payout);
      created++;
    }

    return { created, skipped };
  }

  // Batch/backfill version -- walks every daily entry in a month and runs
  // generatePayoutsForEntry() on each. Useful for entries that existed
  // before this automatic hook was added, or if a run needs to be redone.
  async generatePayouts(month: string) {
    const { start, end } = this.monthRange(month);

    const entries = await this.dailyEntryRepository.find({
      where: { createdAt: Between(start, end) },
      relations: ['task', 'employees'],
    });

    let created = 0;
    let skipped = 0;

    for (const entry of entries) {
      const result = await this.generatePayoutsForEntry(entry);
      created += result.created;
      skipped += result.skipped;
    }

    return { month, entriesProcessed: entries.length, created, skipped };
  }

  getPayouts(month?: string) {
    return this.payoutRepository.find({
      where: month ? { periodMonth: month } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async getPayoutSummary(month: string): Promise<PayoutSummaryRow[]> {
    const payouts = await this.payoutRepository.find({ where: { periodMonth: month } });

    const map = new Map<number, PayoutSummaryRow>();
    for (const p of payouts) {
      const row = map.get(p.employeeId) ?? {
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        totalWeight: 0,
        entryCount: 0,
        totalPayout: 0,
      };
      row.totalWeight += p.weightShare;
      row.entryCount += 1;
      row.totalPayout += p.amount;
      map.set(p.employeeId, row);
    }

    return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }
}
