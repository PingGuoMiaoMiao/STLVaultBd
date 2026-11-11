import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AUTH_COOKIE, AUTH_COOKIE_MAX_AGE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendCodeDto } from './dto/resend-code.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** 注册：建号并发送邮箱验证码 */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** 校验邮箱验证码，激活账号 */
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  /** 重发验证码 */
  @Post('resend-code')
  resendCode(@Body() dto: ResendCodeDto) {
    return this.auth.resendCode(dto.email, dto.purpose);
  }

  /** 登录：签发 JWT 并写入 httpOnly cookie */
  @Post('login')
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

  /** 退出登录：清掉 cookie */
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    return { ok: true };
  }

  /** 找回密码：发送验证码 */
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  /** 找回密码：用验证码设置新密码 */
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
