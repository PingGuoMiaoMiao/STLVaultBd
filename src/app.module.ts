import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MailModule } from './mail/mail.module.js';
import { ModelsModule } from './models/models.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    // 全局兜底：每个 IP 每分钟最多 60 次请求
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    ModelsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局启用限流；登录等敏感接口在 controller 上单独收紧
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
