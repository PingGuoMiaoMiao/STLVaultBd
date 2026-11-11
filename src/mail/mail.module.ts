import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

// @Global() 让任何模块都能直接注入 MailService，不用重复 import
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
