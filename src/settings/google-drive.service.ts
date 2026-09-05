import * as fs from 'fs';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { GoogleDriveConnection } from './google-drive-connection.entity';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

const BACKUP_FOLDER_NAME = 'CanproSys Backups';

// Wraps the whole Google OAuth + Drive-upload dance so BackupService and the
// settings controller don't need to know anything about googleapis
// directly. Connection state (tokens, connected email, cached folder id)
// lives in a single GoogleDriveConnection row -- see that entity for why
// it's effectively a singleton.
@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    @InjectRepository(GoogleDriveConnection)
    private connectionRepository: Repository<GoogleDriveConnection>,
  ) {}

  private requireOAuthEnv() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'Google OAuth is not configured on the server -- set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env first.',
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  private newOAuthClient(): OAuth2Client {
    const { clientId, clientSecret, redirectUri } = this.requireOAuthEnv();
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  // Step 1 of the flow: build the URL the browser sends the admin to.
  // access_type=offline + prompt=consent together are what guarantee Google
  // actually issues a refresh_token -- without prompt=consent, a Google
  // account that has already granted this app access before (e.g.
  // reconnecting) can silently skip re-issuing one.
  getAuthUrl(): string {
    const client = this.newOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
  }

  // Step 2: Google redirects the browser back here with a one-time `code`.
  // Exchange it for tokens, find out which account just connected, and
  // persist everything as the single connection row (replacing whatever was
  // there before, if anything).
  async handleCallback(code: string): Promise<GoogleDriveConnection> {
    const client = this.newOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? 'unknown';

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        "Google didn't return a refresh token -- if this account connected before, revoke this app's access at https://myaccount.google.com/permissions and try connecting again.",
      );
    }

    let connection = await this.connectionRepository.findOneBy({});
    if (!connection) {
      connection = this.connectionRepository.create();
    }
    connection.connectedEmail = email;
    connection.accessToken = tokens.access_token ?? '';
    connection.refreshToken = tokens.refresh_token;
    connection.tokenExpiryDate = tokens.expiry_date ?? null;
    return this.connectionRepository.save(connection);
  }

  async getConnection(): Promise<GoogleDriveConnection | null> {
    return this.connectionRepository.findOneBy({});
  }

  async disconnect(): Promise<void> {
    const connection = await this.connectionRepository.findOneBy({});
    if (connection) {
      await this.connectionRepository.remove(connection);
    }
  }

  // Rebuilds an authorized client from the stored refresh token. googleapis
  // auto-refreshes the access token on demand; the 'tokens' listener below
  // persists the refreshed access token back to the DB so we're not doing a
  // full token exchange on every single call.
  private async getAuthorizedClient(connection: GoogleDriveConnection): Promise<OAuth2Client> {
    const client = this.newOAuthClient();
    client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      expiry_date: connection.tokenExpiryDate ?? undefined,
    });
    client.on('tokens', (tokens) => {
      if (tokens.access_token) {
        connection.accessToken = tokens.access_token;
        connection.tokenExpiryDate = tokens.expiry_date ?? connection.tokenExpiryDate;
        this.connectionRepository.save(connection).catch((err) => {
          this.logger.warn(`Failed to persist refreshed Google token: ${err}`);
        });
      }
    });
    return client;
  }

  private async findOrCreateBackupFolder(client: OAuth2Client, connection: GoogleDriveConnection): Promise<string> {
    if (connection.driveFolderId) return connection.driveFolderId;

    const drive = google.drive({ version: 'v3', auth: client });
    const existing = await drive.files.list({
      q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    const folderId = existing.data.files?.[0]?.id;
    if (folderId) {
      connection.driveFolderId = folderId;
      await this.connectionRepository.save(connection);
      return folderId;
    }

    const created = await drive.files.create({
      requestBody: { name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    const newFolderId = created.data.id;
    if (!newFolderId) {
      throw new Error('Google Drive did not return an id for the newly created backup folder');
    }
    connection.driveFolderId = newFolderId;
    await this.connectionRepository.save(connection);
    return newFolderId;
  }

  // Uploads one local file into the (auto-created) backup folder. Returns
  // enough info for BackupLog to link straight to it from the UI.
  async uploadFile(filePath: string, fileName: string): Promise<{ fileId: string; webViewLink?: string }> {
    const connection = await this.connectionRepository.findOneBy({});
    if (!connection) {
      throw new BadRequestException('Google Drive is not connected.');
    }
    const client = await this.getAuthorizedClient(connection);
    const folderId = await this.findOrCreateBackupFolder(client, connection);
    const drive = google.drive({ version: 'v3', auth: client });

    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) },
      fields: 'id, webViewLink',
    });

    if (!res.data.id) {
      throw new Error('Google Drive did not return an id for the uploaded backup');
    }
    return { fileId: res.data.id, webViewLink: res.data.webViewLink ?? undefined };
  }

  // Deletes backup files older than keepDays from the Drive folder --
  // mirrors the local rotation logic in scripts/backup-db.sh so Drive
  // doesn't grow forever either.
  async pruneOldBackups(keepDays: number): Promise<void> {
    const connection = await this.connectionRepository.findOneBy({});
    if (!connection?.driveFolderId) return;

    const client = await this.getAuthorizedClient(connection);
    const drive = google.drive({ version: 'v3', auth: client });
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();

    const res = await drive.files.list({
      q: `'${connection.driveFolderId}' in parents and trashed=false and createdTime < '${cutoff}'`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    for (const file of res.data.files ?? []) {
      if (!file.id) continue;
      await drive.files.delete({ fileId: file.id });
      this.logger.log(`Pruned old Drive backup: ${file.name}`);
    }
  }
}
