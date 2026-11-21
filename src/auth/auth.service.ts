import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { UPLOAD_ROOT } from '../models/upload.config.js';
import { VerificationService } from '../verification/verification.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

// 对外返回的用户字段白名单：永远不含 password
const USER_SELECT = {
  id: true,
  username: true,
  nickname: true,
  email: true,
  avatar: true,
} as const;

type PublicUser = {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string | null;
};

function pick(user: PublicUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    avatar: user.avatar,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private verification: VerificationService,
    private jwt: JwtService,
  ) {}

  /** 注册：建号（未激活）→ 发送验证码 */
  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (exists) throw new ConflictException('用户名或邮箱已被注册');

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { ...dto, password },
      select: USER_SELECT,
    });

    // 邮件发送失败不推翻注册：账号已建好，用户可点「重发验证码」
    let codeSent = true;
    try {
      await this.verification.issueCode(user.email, 'register');
    } catch {
      codeSent = false;
    }

    return { ...user, codeSent };
  }

  /** 校验邮箱验证码，通过后激活账号 */
  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new NotFoundException('该邮箱未注册');

    // 已激活过就直接返回，保证接口幂等
    if (user.emailVerifiedAt) {
      return { ...pick(user), alreadyVerified: true };
    }

    await this.verification.verifyCode(dto.email, dto.code, 'register');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
      select: USER_SELECT,
    });

    return { ...updated, alreadyVerified: false };
  }

  /** 重发验证码（register 需账号存在且未验证；reset_password 静默处理） */
  async resendCode(email: string, purpose: 'register' | 'reset_password') {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (purpose === 'register') {
      if (!user) throw new NotFoundException('该邮箱未注册');
      if (user.emailVerifiedAt) {
        throw new BadRequestException('该邮箱已验证，无需重发');
      }
    } else if (!user) {
      // 找回密码：邮箱不存在也返回成功，防止被用来探测注册情况
      return { ok: true };
    }

    await this.verification.issueCode(email, purpose);
    return { ok: true };
  }

  /** 登录：密码正确 + 邮箱已激活，签发 JWT 并返回用户信息 */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // 用户不存在与密码错误用同一文案，防用户枚举
    if (!user) throw new UnauthorizedException('邮箱或密码错误');

    const passwordOk = await bcrypt.compare(dto.password, user.password);
    if (!passwordOk) throw new UnauthorizedException('邮箱或密码错误');

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('邮箱尚未验证，请先完成邮箱验证');
    }

    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: pick(user) };
  }

  /** 用 cookie 里的 token 换取当前用户；token 无效或用户不存在都抛 401 */
  async getUserFromToken(token: string) {
    let payload: { sub: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub: number }>(token);
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('账号不存在');

    return pick(user);
  }

  /** 找回密码第一步：发送重置验证码（邮箱不存在也静默成功） */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      try {
        await this.verification.issueCode(email, 'reset_password');
      } catch (err) {
        // 60 秒内重复请求：静默忽略，避免暴露邮箱是否存在
        if (!(err instanceof BadRequestException)) return { ok: true };
      }
    }
    return { ok: true };
  }

  /** 找回密码第二步：校验验证码后更新密码 */
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new BadRequestException('验证码无效');

    await this.verification.verifyCode(
      dto.email,
      dto.code,
      'reset_password',
    );

    const password = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password },
    });

    return { ok: true };
  }

  /** 个人中心：基本资料 + 投稿/获赞/评论统计 */
  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...USER_SELECT, createdAt: true },
    });
    if (!user) throw new NotFoundException('账号不存在');

    const [uploads, likes, comments] = await Promise.all([
      this.prisma.model.count({ where: { userId } }),
      this.prisma.modelLike.count({ where: { model: { userId } } }),
      this.prisma.comment.count({ where: { userId } }),
    ]);

    return { ...user, stats: { uploads, likes, comments } };
  }

  /** 修改昵称 */
  updateProfile(userId: number, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto.nickname ? { nickname: dto.nickname.trim() } : {},
      select: USER_SELECT,
    });
  }

  /** 换头像：写新路径，顺手删掉旧文件 */
  async updateAvatar(userId: number, avatarUrl: string) {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: USER_SELECT,
    });

    if (before?.avatar && before.avatar !== avatarUrl) {
      await this.removeUpload(before.avatar);
    }

    return user;
  }

  /** 修改密码：需要验证当前密码 */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('账号不存在');

    const ok = await bcrypt.compare(dto.currentPassword, user.password);
    if (!ok) throw new BadRequestException('当前密码不正确');

    const password = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password },
    });

    return { ok: true };
  }

  /** 只处理 /uploads/ 下的文件 */
  private async removeUpload(url?: string | null) {
    if (!url || !url.startsWith('/uploads/')) return;

    const relative = url.slice('/uploads/'.length);
    if (relative.includes('..')) return;

    await rm(join(UPLOAD_ROOT, relative), { force: true });
  }
}
