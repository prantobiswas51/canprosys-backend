import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type BackupStatus = 'success' | 'failed';
export type BackupTrigger = 'schedule' | 'manual';

// One row per backup attempt -- this is what makes backup failures visible
// in the UI instead of only ever showing up as a silent gap in Drive (the
// same "hard to find out" problem the exception filter fixed for API
// errors, applied here to the backup job).
@Entity()
export class BackupLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt?: Date;

  @Column()
  status: BackupStatus;

  @Column()
  trigger: BackupTrigger;

  @Column({ nullable: true })
  fileName?: string;

  @Column('bigint', { nullable: true })
  sizeBytes?: number;

  // Set only when the dump was successfully uploaded to Drive -- lets the
  // UI link straight to the file instead of just saying "done".
  @Column({ nullable: true })
  driveFileId?: string;

  @Column({ nullable: true })
  driveWebViewLink?: string;

  // Full error message on failure (pg_dump failing, Drive upload failing,
  // token refresh failing, etc.) -- same idea as the requestId-tagged
  // exception log, just for a background job instead of an HTTP request.
  @Column('text', { nullable: true })
  errorMessage?: string;
}
