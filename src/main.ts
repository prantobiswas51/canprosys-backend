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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
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
