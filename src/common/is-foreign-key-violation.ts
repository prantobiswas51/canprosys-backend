import { QueryFailedError } from 'typeorm';

// Shared by every delete-guard across the app (cars, drivers, routes, tasks,
// raw materials, wood types/stages, waste types, maintenance categories).
//
// Root cause of a real bug this fixes: every one of those services used to
// carry its own copy of this check as `(err as any).code === '23503'`.
// QueryFailedError is *supposed* to copy the pg driver's own properties
// (including `code`) onto itself, but that only happens reliably when the
// installed typeorm version on a given machine actually does that merge --
// if dev machine and server ever drift on typeorm/pg versions (or a
// lockfile isn't respected on install), `err.code` silently comes back
// undefined, the check fails, and the raw Postgres FK-violation error
// escapes as an unhandled 500 instead of the intended clean 409. Checking
// `driverError.code` directly (the one place pg's error always lives) plus
// a message-text fallback makes this resilient to that either way.
export function isForeignKeyViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const code =
    (err as unknown as { code?: string }).code ??
    (err as unknown as { driverError?: { code?: string } }).driverError?.code;
  if (code === '23503') return true;
  return /foreign key constraint/i.test(err.message);
}
