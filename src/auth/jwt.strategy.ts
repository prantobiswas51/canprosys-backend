import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';

// The token lives in an httpOnly cookie, not an Authorization header, so we
// need a custom extractor instead of passport-jwt's built-in bearer-token one.
const cookieExtractor = (req: Request): string | null => {
  const token = req?.cookies?.token as string | undefined;
  return token ?? null;
};

interface JwtPayload {
  sub: number;
  username?: string;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: cookieExtractor,
      secretOrKey: process.env.JWT_SECRET || 'dev_secret_change_me',
    });
  }

  // Whatever this returns becomes req.user on guarded routes.
  validate(payload: JwtPayload) {
    return { userId: payload.sub, username: payload.username, name: payload.name };
  }
}
