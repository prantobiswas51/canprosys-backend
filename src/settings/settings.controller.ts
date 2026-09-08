import { BadRequestException, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoogleDriveService } from './google-drive.service';
import { BackupService } from './backup.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private googleDriveService: GoogleDriveService,
    private backupService: BackupService,
  ) {}

  @Get('google-drive/status')
  async getStatus() {
    const connection = await this.googleDriveService.getConnection();
    return connection
      ? { connected: true, email: connection.connectedEmail, connectedAt: connection.connectedAt }
      : { connected: false };
  }

  // Frontend does a full top-level navigation (window.location.href) to this
  // endpoint rather than fetching it -- a 302 to Google's consent screen has
  // to be a real browser navigation, not an XHR/fetch response.
  @Get('google-drive/connect')
  async connect(@Res() res: Response) {
    const url = this.googleDriveService.getAuthUrl();
    res.redirect(url);
  }

  // Google redirects the browser back here after the admin approves (or
  // denies) access. Either way, hand control back to the frontend Settings
  // page with a query flag it can show a message for.
  @Get('google-drive/callback')
  async callback(@Query('code') code: string | undefined, @Query('error') error: string | undefined, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const settingsUrl = `${frontendUrl}/settings`;

    if (error || !code) {
      return res.redirect(`${settingsUrl}?drive=denied`);
    }

    try {
      await this.googleDriveService.handleCallback(code);
      return res.redirect(`${settingsUrl}?drive=connected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.redirect(`${settingsUrl}?drive=error&message=${encodeURIComponent(message)}`);
    }
  }

  @Post('google-drive/disconnect')
  async disconnect() {
    await this.googleDriveService.disconnect();
    return { disconnected: true };
  }

  @Post('backups/run-now')
  async runNow() {
    const connection = await this.googleDriveService.getConnection();
    if (!connection) {
      throw new BadRequestException('Connect Google Drive first.');
    }
    return this.backupService.runBackup('manual');
  }

  @Get('backups')
  async getBackupHistory() {
    return this.backupService.getHistory();
  }

  // Plain <a href> download from the frontend, not axios -- streams the
  // exact file archived on Drive back through our backend, so the admin
  // doesn't need their own separate Drive access to grab a copy.
  @Get('backups/:id/download')
  async downloadBackup(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const log = await this.backupService.getById(id);
    if (!log?.driveFileId) {
      throw new NotFoundException('No downloadable file for this backup.');
    }
    const stream = await this.googleDriveService.downloadFileStream(log.driveFileId);
    res.setHeader('Content-Disposition', `attachment; filename="${log.fileName ?? 'backup.dump'}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }

  // Same idea, for the separate uploads/ (NID images etc.) archive that
  // rides alongside the DB dump for the same backup run -- not every log
  // row has one (uploads/ may not have existed yet at that point), hence
  // the same "no downloadable file" 404 rather than assuming it's there.
  @Get('backups/:id/download-uploads')
  async downloadUploadsArchive(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const log = await this.backupService.getById(id);
    if (!log?.uploadsDriveFileId) {
      throw new NotFoundException('No uploads archive for this backup.');
    }
    const stream = await this.googleDriveService.downloadFileStream(log.uploadsDriveFileId);
    res.setHeader('Content-Disposition', `attachment; filename="${log.uploadsFileName ?? 'uploads.tar.gz'}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }
}
