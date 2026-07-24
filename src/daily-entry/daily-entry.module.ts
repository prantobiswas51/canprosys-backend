import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyEntryController } from './daily-entry.controller';
import { DailyEntryService } from './daily-entry.service';
import { DailyEntry } from './daily-entry.entity';
import { Task } from '../tasks/task.entity';
import { Employee } from '../employees/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DailyEntry, Task, Employee])],
  controllers: [DailyEntryController],
  providers: [DailyEntryService],
})
export class DailyEntryModule {}
