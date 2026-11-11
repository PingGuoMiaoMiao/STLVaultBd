import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // credentials: true 才允许浏览器跨域携带 httpOnly cookie
  app.enableCors({ origin: 'http://localhost:3000', credentials: true });
  // 解析 Cookie 头到 req.cookies
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(3001);
  console.log('Nest API: http://localhost:3001/api');
}
await bootstrap();
