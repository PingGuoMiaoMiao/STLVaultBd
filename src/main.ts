import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // 允许的来源，逗号分隔。本地默认前端 3000；
  // 部署后前端走 /api 反向代理时浏览器不跨域，这里保留可配置只是为了直连场景。
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // credentials: true 才允许浏览器跨域携带 httpOnly cookie
  app.enableCors({ origin: corsOrigins, credentials: true });
  // 解析 Cookie 头到 req.cookies
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 云平台（Railway/Render 等）会注入 PORT
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Nest API: http://localhost:${port}/api`);
}
await bootstrap();
