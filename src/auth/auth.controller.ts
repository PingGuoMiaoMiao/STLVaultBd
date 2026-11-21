import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { avatarUploadOptions } from '../models/upload.config.js';
import { AUTH_COOKIE, AUTH_COOKIE_MAX_AGE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { LoggedInGuard, type AuthedRequest } from './logged-in.guard.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendCodeDto } from './dto/resend-code.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** 注册：建号并发送邮箱验证码 */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** 校验邮箱验证码，激活账号 */
  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  /** 重发验证码 */
  @Post('resend-code')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendCode(@Body() dto: ResendCodeDto) {
    return this.auth.resendCode(dto.email, dto.purpose);
  }

  /** 登录：签发 JWT 并写入 httpOnly cookie */
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.auth.login(dto);

    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true, // JS 读不到，防 XSS 窃取
      sameSite: 'lax', // 防止 CSRF 跨站提交
      secure: false, // 本地 http 开发；上线 https 后改 true
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE, // 浏览器保留 7 天
    });

    return user;
  }

  /** 当前登录用户（前端用来判断登录态） */
  @Get('me')
  me(@Req() req: Request) {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      AUTH_COOKIE
    ];
    if (!token) throw new UnauthorizedException('未登录');
    return this.auth.getUserFromToken(token);
  }

  /** 个人中心：资料 + 投稿/获赞/评论统计 */
  @Get('profile')
  @UseGuards(LoggedInGuard)
  profile(@Req() req: AuthedRequest) {
    return this.auth.getProfile(req.user!.id);
  }

  /** 修改昵称 */
  @Patch('profile')
  @UseGuards(LoggedInGuard)
  updateProfile(@Body() dto: UpdateProfileDto, @Req() req: AuthedRequest) {
    return this.auth.updateProfile(req.user!.id, dto);
  }

  /** 上传头像（单张图片，5MB 以内） */
  @Post('avatar')
  @UseGuards(LoggedInGuard)
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions))
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!file) throw new BadRequestException('请选择头像图片');

    return this.auth.updateAvatar(
      req.user!.id,
      `/uploads/avatars/${file.filename}`,
    );
  }

  /** 修改密码（需登录 + 验证当前密码） */
  @Patch('password')
  @UseGuards(LoggedInGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthedRequest,
  ) {
    return this.auth.changePassword(req.user!.id, dto);
  }

  /** 退出登录：清掉 cookie */
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    return { ok: true };
  }

  /** 找回密码：发送验证码 */
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  /** 找回密码：用验证码设置新密码 */
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
