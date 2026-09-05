import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupLog, BackupTrigger } from './backup-log.entity';
import { GoogleDriveService } from './google-drive.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @InjectRepository(BackupLog) private backupLogRepository: Repository<BackupLog>,
    private googleDriveService: GoogleDriveService,
  ) {}

  // Same schedule as the old cron-driven scripts/backup-db.sh -- this
  // in-app job supersedes that script for automated runs (the script still
  // works standalone if ever needed, e.g. before Drive is connected).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleScheduledBackup() {
    await this.runBackup('schedule');
  }

  async runBackup(trigger: BackupTrigger): Promise<BackupLog> {
    const log = this.backupLogRepository.create({ status: 'failed', trigger });
    let tempFile: string | undefined;

    try {
      const connection = await this.googleDriveService.getConnection();
      if (!connection) {
        throw new Error('Google Drive is not connected -- connect it on the Settings page first.');
      }

      const dbName = process.env.DATABASE_NAME || 'nestbackend';
      const fileName = `${dbName}_${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
      tempFile = path.join(os.tmpdir(), fileName);

      this.logger.log(`Starting backup of '${dbName}' -> ${tempFile}`);
      await execFileAsync('pg_dump', [
        '-Fc',
        '-h', process.env.DATABASE_HOST || 'localhost',
        '-p', process.env.DATABASE_PORT || '5432',
        '-U', process.env.DATABASE_USER || 'postgres',
        '-d', dbName,
        '-f', tempFile,
      ], {
        env: { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD || '' },
      });

      const { size } = await fs.promises.stat(tempFile);
      log.fileName = fileName;
      log.sizeBytes = size;

      this.logger.log(`Uploading ${fileName} (${size} bytes) to Google Drive`);
      const { fileId, webViewLink } = await this.googleDriveService.uploadFile(tempFile, fileName);
      log.driveFileId = fileId;
      log.driveWebViewLink = webViewLink;
      log.status = 'success';

      const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 14;
      await this.googleDriveService.pruneOldBackups(keepDays).catch((err) => {
        // Pruning failure shouldn't mark an otherwise-successful backup as
        // failed -- just log it, there'll be another chance tomorrow.
        this.logger.warn(`Failed to prune old Drive backups: ${err}`);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Backup failed: ${message}`, err instanceof Error ? err.stack : undefined);
      log.status = 'failed';
      log.errorMessage = message;
    } finally {
      log.finishedAt = new Date();
      if (tempFile) {
        await fs.promises.unlink(tempFile).catch(() => undefined);
      }
    }

    return this.backupLogRepository.save(log);
  }

  async getHistory(limit = 20): Promise<BackupLog[]> {
    return this.backupLogRepository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }
}
