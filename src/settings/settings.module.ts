import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleDriveConnection } from './google-drive-connection.entity';
import { BackupLog } from './backup-log.entity';
import { GoogleDriveService } from './google-drive.service';
import { BackupService } from './backup.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GoogleDriveConnection, BackupLog])],
  controllers: [SettingsController],
  providers: [GoogleDriveService, BackupService],
})
export class SettingsModule {}
