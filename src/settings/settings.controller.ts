import { BadRequestException, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
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
}
