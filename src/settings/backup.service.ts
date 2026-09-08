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

// Same root nid-upload.config.ts writes NID images under (NID_UPLOAD_DIR is
// process.cwd()/uploads/nid) -- this is one level up, the whole uploads/
// tree, in case other upload types get added under it later.
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

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
    let tempUploadsFile: string | undefined;

    try {
      const connection = await this.googleDriveService.getConnection();
      if (!connection) {
        throw new Error('Google Drive is not connected -- connect it on the Settings page first.');
      }

      const dbName = process.env.DATABASE_NAME || 'nestbackend';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // "prodhouse" here matches the pm2 process name this backend runs
      // under in production -- not the database name -- so backup files are
      // recognizable at a glance regardless of what the DB itself is called.
      const fileName = `prodhouse-backup-${timestamp}.dump`;
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

      // uploads/ (NID images, etc.) isn't in Postgres, so the dump above
      // never touches it -- archive it separately. Best-effort: a fresh
      // install with no uploads/ yet, or an archiving hiccup, shouldn't
      // knock over an otherwise-successful DB backup.
      tempUploadsFile = await this.archiveUploadsIfPresent(timestamp).catch((err) => {
        this.logger.warn(`Failed to archive uploads/ directory: ${err}`);
        return undefined;
      });
      if (tempUploadsFile) {
        try {
          const uploadsFileName = path.basename(tempUploadsFile);
          const { size: uploadsSize } = await fs.promises.stat(tempUploadsFile);
          this.logger.log(`Uploading ${uploadsFileName} (${uploadsSize} bytes) to Google Drive`);
          const uploaded = await this.googleDriveService.uploadFile(tempUploadsFile, uploadsFileName);
          log.uploadsFileName = uploadsFileName;
          log.uploadsSizeBytes = uploadsSize;
          log.uploadsDriveFileId = uploaded.fileId;
          log.uploadsDriveWebViewLink = uploaded.webViewLink;
        } catch (err) {
          this.logger.warn(`Failed to upload uploads/ archive to Drive: ${err}`);
        }
      }

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
      if (tempUploadsFile) {
        await fs.promises.unlink(tempUploadsFile).catch(() => undefined);
      }
    }

    return this.backupLogRepository.save(log);
  }

  // Tars+gzips the whole uploads/ directory (NID images live under
  // uploads/nid/, but this grabs everything under uploads/ so future upload
  // types are covered too without another change here). Returns undefined
  // -- not an error -- if uploads/ doesn't exist or is empty, since that's
  // the normal state for a fresh install with no NID images uploaded yet.
  private async archiveUploadsIfPresent(timestamp: string): Promise<string | undefined> {
    if (!fs.existsSync(UPLOADS_DIR)) return undefined;
    const hasAnyFiles = await this.dirHasFiles(UPLOADS_DIR);
    if (!hasAnyFiles) return undefined;

    const fileName = `prodhouse-uploads-${timestamp}.tar.gz`;
    const tempPath = path.join(os.tmpdir(), fileName);

    // -C process.cwd() + relative "uploads" so the archive extracts back to
    // an "uploads/" folder, not an absolute-path mess.
    await execFileAsync('tar', ['-czf', tempPath, '-C', process.cwd(), 'uploads']);
    return tempPath;
  }

  private async dirHasFiles(dir: string): Promise<boolean> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) return true;
      if (entry.isDirectory() && (await this.dirHasFiles(path.join(dir, entry.name)))) return true;
    }
    return false;
  }

  async getHistory(limit = 20): Promise<BackupLog[]> {
    return this.backupLogRepository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async getById(id: number): Promise<BackupLog | null> {
    return this.backupLogRepository.findOneBy({ id });
  }
}
