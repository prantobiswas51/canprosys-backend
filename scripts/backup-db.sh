#!/usr/bin/env bash
# Daily Postgres backup for this app's database.
# Reads DB connection info from .env (same file the app itself uses), so no
# credentials are hardcoded here or need to be duplicated in crontab.
#
# What it does:
#   1. pg_dump's the DB in custom format (-Fc) -- compressed, and restorable
#      selectively/in parallel with pg_restore (unlike a plain .sql dump).
#   2. Names the file with a timestamp.
#   3. Deletes local backups older than KEEP_DAYS so disk doesn't fill up.
#   4. If rclone is installed and configured with a remote named
#      $GDRIVE_REMOTE (see setup below), also uploads the dump to Google
#      Drive and prunes remote copies older than KEEP_DAYS -- so a lost/
#      wiped server doesn't take the backups down with it. If rclone isn't
#      set up yet, this step is skipped with a warning, not a failure --
#      the local backup still happens either way.
#
# Setup (run once):
#   chmod +x scripts/backup-db.sh
#
#   # 1. Install rclone:
#   curl https://rclone.org/install.sh | sudo bash
#
#   # 2. Connect it to Google Drive (needs a one-time login):
#   rclone config
#     -> n (new remote), name it: gdrive
#     -> storage type: drive (Google Drive)
#     -> client_id / client_secret: leave blank (press enter) to use rclone's own
#     -> scope: 1 (full access)
#     -> leave root_folder_id / service_account blank
#     -> "Edit advanced config?" -> n
#     -> "Use auto config?" -> n   (server has no browser)
#          rclone prints a URL -- open it on your phone/laptop, sign in to
#          the Google account you want backups in, approve, and paste the
#          verification code it gives you back into this prompt
#     -> "Configure this as a Shared Drive?" -> n (unless you use one)
#     -> y to confirm, q to quit config
#
#   # 3. Sanity check:
#   rclone lsd gdrive:
#
#   crontab -e
#   # add this line to run every night at 3:10am:
#   10 3 * * * /home/canvas/apps/production-house/backend/scripts/backup-db.sh >> /home/canvas/backups/backup.log 2>&1
#
# Restore from a local backup:
#   pg_restore --clean --if-exists -h localhost -U postgres -d <dbname> /path/to/backup.dump
#
# Restore from Google Drive (pull it down first):
#   rclone copy gdrive:canprosys-backups/<file>.dump .
#   pg_restore --clean --if-exists -h localhost -U postgres -d <dbname> <file>.dump

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
GDRIVE_REMOTE="${GDRIVE_REMOTE:-gdrive}"
GDRIVE_PATH="${GDRIVE_PATH:-canprosys-backups}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# Pull just the DB vars out of .env without executing the whole file (it may
# contain values with spaces/quotes we don't want the shell to interpret).
get_env() {
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//'
}

DB_HOST=$(get_env DATABASE_HOST)
DB_PORT=$(get_env DATABASE_PORT)
DB_USER=$(get_env DATABASE_USER)
DB_PASSWORD=$(get_env DATABASE_PASSWORD)
DB_NAME=$(get_env DATABASE_NAME)

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%F_%H%M%S)
OUT_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump"

echo "[$(date)] Backing up '$DB_NAME' -> $OUT_FILE"
PGPASSWORD="$DB_PASSWORD" pg_dump -Fc \
  -h "${DB_HOST:-localhost}" \
  -p "${DB_PORT:-5432}" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "$OUT_FILE"

echo "[$(date)] Done ($(du -h "$OUT_FILE" | cut -f1))"

# Rotate old local backups
find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -type f -mtime +"$KEEP_DAYS" -print -delete

# Upload to Google Drive via rclone, if it's installed and this remote is
# configured. Skipped (with a warning, not a failure) otherwise, so backups
# still work locally even before Drive is set up.
if command -v rclone >/dev/null 2>&1 && rclone listremotes | grep -q "^${GDRIVE_REMOTE}:$"; then
  echo "[$(date)] Uploading to ${GDRIVE_REMOTE}:${GDRIVE_PATH}"
  rclone copy "$OUT_FILE" "${GDRIVE_REMOTE}:${GDRIVE_PATH}" --quiet
  echo "[$(date)] Pruning ${GDRIVE_REMOTE}:${GDRIVE_PATH} entries older than ${KEEP_DAYS}d"
  rclone delete "${GDRIVE_REMOTE}:${GDRIVE_PATH}" --min-age "${KEEP_DAYS}d" --quiet
else
  echo "[$(date)] WARNING: rclone remote '${GDRIVE_REMOTE}' not found -- skipping Google Drive upload. See setup instructions at the top of this script."
fi
