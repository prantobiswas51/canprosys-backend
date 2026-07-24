import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const COOKIE_NAME = 'token';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { username: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(body.username, body.password);
    const token = this.authService.signToken(user);

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ONE_DAY_MS,
    });

    return { id: user.id, name: user.name, username: user.username };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME);
    return { success: true };
  }

  // Frontend calls this on app load to check "am I already logged in?"
  // (e.g. after a page refresh, since there's no token in JS-land to check).
  // Looks the user up fresh from the DB (with role) rather than just
  // returning the JWT payload, so the frontend gets accurate, current data.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    const { userId } = req.user as { userId: number };
    return this.authService.getSafeUserById(userId);
  }
}
