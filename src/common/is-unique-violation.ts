import { QueryFailedError } from 'typeorm';

// Same fragility -- and same fix -- as is-foreign-key-violation.ts: don't
// rely solely on `err.code` (only reliably populated if the installed
// typeorm version merges the pg driver's own properties onto the
// QueryFailedError instance); check `driverError.code` directly too, with a
// message-text fallback.
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const code =
    (err as unknown as { code?: string }).code ??
    (err as unknown as { driverError?: { code?: string } }).driverError?.code;
  if (code === '23505') return true;
  return /duplicate key value violates unique constraint/i.test(err.message);
}
