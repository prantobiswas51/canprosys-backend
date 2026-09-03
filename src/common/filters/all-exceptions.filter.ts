import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

// Global catch-all. Without this, an unhandled error (anything that isn't a
// deliberately-thrown HttpException) hits Nest's built-in default filter,
// which does two unhelpful things at once: it sends the client a bare
// {"statusCode":500,"message":"Internal server error"} with zero detail,
// AND it only prints the stack trace to stdout with no other context -- no
// method/URL, no SQL query/params for a DB error -- so tracking down "what
// actually broke" means grepping raw pm2 logs and hoping the right lines
// are still in the buffer. This filter logs everything needed to find the
// cause in one place, and tags both the log line and the client response
// with the same short requestId so a bug report ("got a 500, id abc123")
// can be grep'd straight to the matching log entry:
//   pm2 logs canprosys-backend --err --lines 500 --nostream | grep abc123
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = Math.random().toString(36).slice(2, 8);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // A deliberately-thrown HttpException with a 5xx status is still
      // unexpected enough to warrant a full stack trace. Ordinary 4xx
      // traffic (validation errors, not-found, conflict guards, etc.) just
      // gets a one-line note -- logging a stack trace for every 400 would
      // bury the errors that actually matter.
      if (status >= 500) {
        this.logger.error(
          `[${requestId}] ${request.method} ${request.originalUrl} -> ${status}: ${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.warn(`[${requestId}] ${request.method} ${request.originalUrl} -> ${status}: ${exception.message}`);
      }

      response
        .status(status)
        .json(typeof body === 'object' && body !== null ? { ...body, requestId } : { message: body, requestId });
      return;
    }

    // Anything else is an unhandled bug -- always answered as 500. Pull out
    // the extra detail TypeORM attaches to a failed query (the SQL text +
    // bound parameters), since Postgres's own message ("invalid input
    // syntax for type integer", a FK violation, etc.) alone rarely says
    // which column/row caused it -- that's what took manual log-diving to
    // find every time so far.
    let detail = '';
    if (exception instanceof QueryFailedError) {
      const driverMessage = (exception as unknown as { driverError?: { message?: string } }).driverError?.message;
      detail = ` | query: ${exception.query} | params: ${JSON.stringify(exception.parameters)}${driverMessage ? ` | driver: ${driverMessage}` : ''}`;
    }
    const err = exception instanceof Error ? exception : new Error(String(exception));

    this.logger.error(`[${requestId}] ${request.method} ${request.originalUrl} -> 500: ${err.message}${detail}`, err.stack);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      requestId,
    });
  }
}
