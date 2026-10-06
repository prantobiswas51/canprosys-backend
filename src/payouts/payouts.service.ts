import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, ILike, Repository } from 'typeorm';
import { Payout } from './payout.entity';
import { PayoutSettlement } from './payout-settlement.entity';
import { Loan } from '../loans/loan.entity';
import { DailyEntry } from '../daily-entry/daily-entry.entity';
import { Employee } from '../employees/employee.entity';
import { RecipeTaskRate } from '../recipes/recipe-task-rate.entity';
import { Task } from '../tasks/task.entity';
import { round } from '../common/round';

export interface CreateTaskPayoutInput {
  employeeId: number;
  taskId: number;
  quantity: number;
  // Overrides the task's own flat pricePerUnit for this one payout -- lets
  // a rate be set on the spot (e.g. from the Custom Orders completion
  // popup) for a task that doesn't have one configured yet, without having
  // to go set it on the Tasks page first.
  rate?: number;
  customOrderId?: number;
}

export interface PayoutSummaryRow {
  employeeId: number;
  employeeName: string;
  totalWeight: number;
  entryCount: number;
  // Wages earned this month (sum of Payout.amount).
  totalPayout: number;
  // Loans handed out to this employee this month.
  loanTotal: number;
  // totalPayout - loanTotal -- what actually gets paid out.
  finalPayout: number;
  // Set once the Paid button has been clicked for this employee + month.
  paid: { paidAt: Date; amount: number } | null;
}

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout) private payoutRepository: Repository<Payout>,
    @InjectRepository(PayoutSettlement) private settlementRepository: Repository<PayoutSettlement>,
    @InjectRepository(Loan) private loanRepository: Repository<Loan>,
    @InjectRepository(DailyEntry) private dailyEntryRepository: Repository<DailyEntry>,
    @InjectRepository(Employee) private employeeRepository: Repository<Employee>,
    @InjectRepository(RecipeTaskRate) private recipeTaskRateRepository: Repository<RecipeTaskRate>,
    @InjectRepository(Task) private taskRepository: Repository<Task>,
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
  ): Promise<{ created: number; skipped: number; noRate: number }> {
    if (!entry.task || !entry.employees || entry.employees.length === 0) {
      return { created: 0, skipped: 0, noRate: 0 };
    }

    const payoutRepository = manager ? manager.getRepository(Payout) : this.payoutRepository;
    const employeeRepository = manager ? manager.getRepository(Employee) : this.employeeRepository;
    const recipeTaskRateRepository = manager
      ? manager.getRepository(RecipeTaskRate)
      : this.recipeTaskRateRepository;

    // Rate resolution:
    //  - A recipe (product) was selected on this entry -> pay whatever THAT
    //    recipe's Artisan Wages table says for this task (set on the Recipes
    //    page), not the task's generic flat rate -- different recipes can
    //    (and often do) pay differently for the same task.
    //  - No recipe was selected (raw-material prep tasks like Wood Slicing /
    //    Corner Cutting, which happen before a product is chosen) -> fall
    //    back to the task's own flat pricePerUnit.
    let ratePerUnit: number | null | undefined;
    if (entry.recipeId != null) {
      const recipeTaskRate = await recipeTaskRateRepository.findOneBy({
        recipeId: entry.recipeId,
        taskId: entry.task.id,
      });
      ratePerUnit = recipeTaskRate?.rate;
    } else {
      ratePerUnit = entry.task.pricePerUnit;
    }

    if (ratePerUnit == null) {
      // Nothing to pay -- either the task has no flat rate set, or (when a
      // recipe was selected) that recipe has no wage configured for this
      // task yet. Skip instead of creating a misleading ৳0 payout; go set
      // the rate up (Task page, or the recipe's Artisan Wages) and re-run
      // "Generate Payouts" for the month to backfill it.
      return { created: 0, skipped: 0, noRate: entry.employees.length };
    }

    const weightShare = round(entry.weightKg / entry.employees.length);
    const amount = round(weightShare * ratePerUnit);
    // entryDate (the day the work was actually logged for, via the form's
    // date picker) drives which month this payout lands in -- falls back to
    // createdAt for entries saved before entryDate existed.
    const periodMonth = (entry.entryDate ?? entry.createdAt.toISOString().slice(0, 10)).slice(0, 7);

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

      // Credit the artisan's running balance -- this is the one place wages
      // actually accrue. increment() issues an atomic UPDATE ... SET balance
      // = balance + amount, so concurrent payout runs can't clobber each
      // other the way a read-modify-write would.
      await employeeRepository.increment({ id: employee.id }, 'balance', amount);
    }

    return { created, skipped, noRate: 0 };
  }

  // A standalone payout, not generated from a daily entry -- used by
  // CustomOrdersService.completeOrder for "this employee did this task on
  // this order, pay them for it". One row per call, unlike
  // generatePayoutsForEntry which fans out to every artisan on an entry.
  // Rate comes straight from the task's own flat pricePerUnit (custom
  // orders have no recipe to look up a per-recipe override against).
  async createTaskPayout(data: CreateTaskPayoutInput, manager?: EntityManager) {
    if (!data.quantity || data.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const payoutRepository = manager ? manager.getRepository(Payout) : this.payoutRepository;
    const employeeRepository = manager ? manager.getRepository(Employee) : this.employeeRepository;
    const taskRepository = manager ? manager.getRepository(Task) : this.taskRepository;

    const employee = await employeeRepository.findOneBy({ id: data.employeeId });
    if (!employee) {
      throw new NotFoundException(`Employee #${data.employeeId} not found`);
    }
    const task = await taskRepository.findOneBy({ id: data.taskId });
    if (!task) {
      throw new NotFoundException(`Task #${data.taskId} not found`);
    }
    if (data.rate != null && data.rate <= 0) {
      throw new BadRequestException('Rate must be greater than zero');
    }
    const ratePerUnit = data.rate ?? task.pricePerUnit;
    if (ratePerUnit == null) {
      throw new BadRequestException(
        `Task "${task.name}" has no rate set -- enter a rate for this row, or add one on the Tasks page.`,
      );
    }

    const amount = round(data.quantity * ratePerUnit);
    const periodMonth = new Date().toISOString().slice(0, 7);

    const payout = payoutRepository.create({
      employeeId: employee.id,
      employeeName: employee.name,
      taskId: task.id,
      taskName: task.name,
      customOrderId: data.customOrderId,
      weightShare: data.quantity,
      ratePerUnit,
      amount,
      periodMonth,
    });
    const saved = await payoutRepository.save(payout);

    await employeeRepository.increment({ id: employee.id }, 'balance', amount);

    return saved;
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
    let noRate = 0;

    for (const entry of entries) {
      const result = await this.generatePayoutsForEntry(entry);
      created += result.created;
      skipped += result.skipped;
      noRate += result.noRate;
    }

    return { month, entriesProcessed: entries.length, created, skipped, noRate };
  }

  getPayouts(month?: string, employeeId?: number) {
    const where: { periodMonth?: string; employeeId?: number } = {};
    if (month) where.periodMonth = month;
    if (employeeId != null) where.employeeId = employeeId;

    return this.payoutRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getPayoutSummary(month: string): Promise<PayoutSummaryRow[]> {
    const [payouts, loans, settlements] = await Promise.all([
      this.payoutRepository.find({ where: { periodMonth: month } }),
      this.loanRepository.find({ where: { periodMonth: month } }),
      this.settlementRepository.find({ where: { periodMonth: month } }),
    ]);

    const map = new Map<number, PayoutSummaryRow>();
    const blankRow = (employeeId: number, employeeName: string): PayoutSummaryRow => ({
      employeeId,
      employeeName,
      totalWeight: 0,
      entryCount: 0,
      totalPayout: 0,
      loanTotal: 0,
      finalPayout: 0,
      paid: null,
    });

    for (const p of payouts) {
      const row = map.get(p.employeeId) ?? blankRow(p.employeeId, p.employeeName);
      row.totalWeight = round(row.totalWeight + p.weightShare);
      row.entryCount += 1;
      row.totalPayout = round(row.totalPayout + p.amount);
      map.set(p.employeeId, row);
    }

    // Employees who took a loan but have no wages yet this month still get
    // a row -- their final payout is just the negative of the loan.
    for (const l of loans) {
      const row = map.get(l.employeeId) ?? blankRow(l.employeeId, l.employeeName);
      row.loanTotal = round(row.loanTotal + l.amount);
      map.set(l.employeeId, row);
    }

    for (const s of settlements) {
      const row = map.get(s.employeeId);
      if (row) row.paid = { paidAt: s.paidAt, amount: s.amount };
    }

    for (const row of map.values()) {
      row.finalPayout = round(row.totalPayout - row.loanTotal);
    }

    return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }

  // The "Paid" button: records that this employee has been handed their
  // final payout (wages - loans) for the month, and debits Employee.balance
  // by that amount so the running balance stays in step with real cash out.
  // The figures are recomputed here from the database, never trusted from
  // the client.
  async markPaid(employeeId: number, month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be YYYY-MM');
    }

    return this.settlementRepository.manager.transaction(async (manager) => {
      const employee = await manager.findOneBy(Employee, { id: employeeId });
      if (!employee) {
        throw new NotFoundException(`Employee #${employeeId} not found`);
      }

      const existing = await manager.findOneBy(PayoutSettlement, { employeeId, periodMonth: month });
      if (existing) {
        throw new ConflictException(`${employee.name} is already marked paid for ${month}.`);
      }

      const [payouts, loans] = await Promise.all([
        manager.find(Payout, { where: { employeeId, periodMonth: month } }),
        manager.find(Loan, { where: { employeeId, periodMonth: month } }),
      ]);
      const wages = round(payouts.reduce((sum, p) => sum + p.amount, 0));
      const loanTotal = round(loans.reduce((sum, l) => sum + l.amount, 0));
      const amount = round(wages - loanTotal);

      if (amount <= 0) {
        throw new BadRequestException(
          `Final payout for ${employee.name} in ${month} is ৳${amount} -- nothing to pay out.`,
        );
      }

      const settlement = await manager.save(
        manager.create(PayoutSettlement, {
          employeeId,
          employeeName: employee.name,
          periodMonth: month,
          wages,
          loans: loanTotal,
          amount,
        }),
      );
      await manager.increment(Employee, { id: employeeId }, 'balance', -amount);

      return settlement;
    });
  }

  // Undo for a misclicked Paid -- removes the record and restores the
  // balance it debited.
  async undoPaid(employeeId: number, month: string) {
    return this.settlementRepository.manager.transaction(async (manager) => {
      const settlement = await manager.findOneBy(PayoutSettlement, { employeeId, periodMonth: month });
      if (!settlement) {
        throw new NotFoundException(`No paid record for employee #${employeeId} in ${month}.`);
      }
      await manager.remove(settlement);
      await manager.increment(Employee, { id: employeeId }, 'balance', settlement.amount);
      return { undone: true };
    });
  }

  // Name/phone lookup + full earnings picture for one employee -- what the
  // AI assistant's "salary" tool uses, since it only ever has a rough name
  // to go on, not an id. currentBalanceOwed is the running accrued-but-not-
  // yet-paid-out total (Employee.balance); lifetimeEarnings/recentPayouts
  // give the history behind that number. Returns null if nothing matches,
  // rather than throwing -- callers show "no such employee" instead of a
  // 404 that'd derail a chat reply.
  async getEmployeeEarnings(employeeQuery: string, month?: string) {
    const trimmed = employeeQuery.trim();
    if (!trimmed) return null;

    const employee = await this.employeeRepository.findOne({
      where: [{ name: ILike(`%${trimmed}%`) }, { phone: ILike(`%${trimmed}%`) }],
    });
    if (!employee) return null;

    const allPayouts = await this.payoutRepository.find({
      where: { employeeId: employee.id },
      order: { createdAt: 'DESC' },
    });
    const lifetimeEarnings = round(allPayouts.reduce((sum, p) => sum + p.amount, 0));

    let monthSummary: { month: string; totalPayout: number; entryCount: number } | undefined;
    if (month) {
      const monthPayouts = allPayouts.filter((p) => p.periodMonth === month);
      monthSummary = {
        month,
        totalPayout: round(monthPayouts.reduce((sum, p) => sum + p.amount, 0)),
        entryCount: monthPayouts.length,
      };
    }

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      status: employee.status,
      currentBalanceOwed: employee.balance,
      lifetimeEarnings,
      monthSummary,
      recentPayouts: allPayouts.slice(0, 10).map((p) => ({
        taskName: p.taskName,
        weightShare: p.weightShare,
        ratePerUnit: p.ratePerUnit,
        amount: p.amount,
        periodMonth: p.periodMonth,
      })),
    };
  }
}
