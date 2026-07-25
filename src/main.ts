// Must run before anything else touches a Date -- forces Node (and every
// timestamp column round-tripped through the pg driver) to interpret and
// display time as Asia/Dhaka regardless of the host machine's own OS timezone.
process.env.TZ = 'Asia/Dhaka';

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
