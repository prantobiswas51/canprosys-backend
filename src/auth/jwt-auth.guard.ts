import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Apply with @UseGuards(JwtAuthGuard) on any controller/route that should
// require a logged-in user. Reads the cookie via JwtStrategy above.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
