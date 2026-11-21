import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 前面有一层 nginx，信任 X-Forwarded-For，限流才能按真实客户端 IP 计数
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  // 上传的模型和封面通过 /uploads/ 直接对外提供（nginx 也可以直接兜这一层）
  app.useStaticAssets(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
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
