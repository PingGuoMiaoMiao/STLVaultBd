import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTH_COOKIE } from './auth.constants.js';

/** 带上当前用户的请求对象 */
export type AuthedRequest = Request & {
  user?: { id: number; email: string };
};

/**
 * 登录守卫：从 cookie 里取 JWT，校验通过后把用户挂到 req.user。
 * 写接口（发布模型等）用它挡住未登录请求。
 */
@Injectable()
export class LoggedInGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      AUTH_COOKIE
    ];

    if (!token) throw new UnauthorizedException('未登录');

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

    req.user = { id: user.id, email: user.email };
    return true;
  }
}
