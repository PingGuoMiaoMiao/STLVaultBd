import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type CodePurpose = 'register' | 'reset_password';

const CODE_TTL_MS = 10 * 60 * 1000; // 有效期 10 分钟
const RESEND_COOLDOWN_MS = 60 * 1000; // 重发冷却 60 秒
const MAX_ATTEMPTS = 5; // 最多试错 5 次

@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /** 生成 6 位验证码并发送邮件；返回明文码（仅调试用） */
  async issueCode(email: string, purpose: CodePurpose) {
    // 冷却检查：60 秒内不允许重复发
    const latest = await this.prisma.verificationCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException(
        '请求过于频繁，请 60 秒后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 旧码统一作废，保证同一时刻只有一个有效码
    await this.prisma.verificationCode.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.prisma.verificationCode.create({
      data: {
        email,
        code,
        purpose,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await this.mail.sendVerificationCode(email, code, purpose);
    return code;
  }

  /** 校验验证码：过期 / 超次数 / 不匹配都抛 400；通过则标记已消费 */
  async verifyCode(email: string, code: string, purpose: CodePurpose) {
    const record = await this.prisma.verificationCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw new BadRequestException('请先获取验证码');

    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('验证码已过期，请重新获取');
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('验证码错误次数过多，请重新获取');
    }

    if (record.code !== code) {
      // 记一次错误次数，防止暴力枚举
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('验证码错误');
    }

    await this.prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }
}
