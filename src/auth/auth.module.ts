import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VerificationModule } from '../verification/verification.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    VerificationModule,
    // global: true 让 JwtService 在任何地方都能注入
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' }, // 与 cookie maxAge 保持一致
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
