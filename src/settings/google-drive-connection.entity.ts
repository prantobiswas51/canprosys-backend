import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Singleton-ish table -- in practice only ever has one row (id 1), since
// this is one company's single backup destination, not a per-user setting.
// Whichever admin runs through the "Connect Google Drive" flow last is the
// account backups go to; connecting again just overwrites this row.
//
// accessToken/refreshToken are plaintext here, same trust level as
// GEMINI_API_KEY sitting in .env -- acceptable for this internal app, but
// worth knowing if this table is ever exposed more broadly.
@Entity()
export class GoogleDriveConnection {
  @PrimaryGeneratedColumn()
  id: number;

  // Whichever Google account completed the OAuth flow -- shown in the UI so
  // an admin can tell at a glance which Drive backups are landing in.
  @Column()
  connectedEmail: string;

  @Column('text')
  accessToken: string;

  // Only issued by Google on the *first* consent (with prompt=consent,
  // access_type=offline) -- this is what lets the backend mint new access
  // tokens indefinitely without the admin re-connecting every hour.
  @Column('text')
  refreshToken: string;

  // Epoch ms -- matches the shape the googleapis client already uses
  // internally (Credentials.expiry_date), so it can be stored/restored
  // without conversion.
  @Column('bigint', { nullable: true })
  tokenExpiryDate: number | null;

  // Drive folder these backups live in -- looked up (or created) once on
  // first connect/upload and cached here so every later run doesn't have to
  // re-search Drive for it.
  @Column({ nullable: true })
  driveFolderId?: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  connectedAt: Date;
}
