import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

// Lets a route accept EITHER your own frontend's logged-in session cookie
// (same check as JwtAuthGuard) OR a static `X-API-Key` header -- so outside
// systems (see Custom Orders) can call these endpoints without a human
// login, while your own app keeps working exactly as before.
//
// Only apply this to routes that are safe for a third party holding just
// the API key to call (read a product type's fields, place an order).
// Anything that lets someone redefine the schema or edit/delete data stays
// on JwtAuthGuard alone.
@Injectable()
export class JwtOrApiKeyGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = process.env.CUSTOM_ORDERS_API_KEY;
    if (expectedKey && providedKey === expectedKey) {
      return true;
    }
    return super.canActivate(context);
  }
}
