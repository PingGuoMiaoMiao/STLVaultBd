import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MailModule } from './mail/mail.module.js';
import { ModelsModule } from './models/models.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, MailModule, AuthModule, ModelsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
