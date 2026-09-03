// Must run before anything else touches a Date -- forces Node (and every
// timestamp column round-tripped through the pg driver) to interpret and
// display time as Asia/Dhaka regardless of the host machine's own OS timezone.
process.env.TZ = 'Asia/Dhaka';

import 'dotenv/config';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  // Every 500 (and every 5xx HttpException) now gets a full stack trace +
  // request context logged server-side, with a requestId shared between the
  // log line and the client response -- see the filter's own comment for
  // why this exists. Without it, unhandled errors were only ever visible by
  // grep-diving raw pm2 logs after the fact.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });
  // Serves whatever's in <project root>/uploads (NID images, etc.) at
  // /uploads/... -- process.cwd(), not __dirname, so it matches the same
  // directory nid-upload.config.ts writes into regardless of running from
  // src (ts-node) or dist (compiled).
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
