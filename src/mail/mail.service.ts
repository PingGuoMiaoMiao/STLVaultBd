import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * 邮件服务：负责把验证码发到用户邮箱
 * 开发时若 SMTP 配置缺失，会退化到「只打印到终端」，避免阻塞流程
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP 配置缺失，验证码只会打印到终端');
      this.transporter = null;
      return;
    }

    const port = Number(process.env.SMTP_PORT ?? 465);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 用 SSL，587 用 STARTTLS
      auth: { user, pass },
    });
  }

  /** 发送验证码邮件；purpose 决定标题文案 */
  async sendVerificationCode(email: string, code: string, purpose: string) {
    const title = purpose === 'reset_password' ? '重置密码验证码' : '注册验证码';
    const from = process.env.MAIL_FROM ?? process.env.SMTP_USER;

    // 没有 SMTP 配置时退化为终端输出（本地开发兜底）
    if (!this.transporter) {
      this.logger.log(`[DEV] ${email} 的${title}: ${code}`);
      return;
    }

    await this.transporter.sendMail({
      from,
      to: email,
      subject: `【STLVault】${title}`,
      html: `
        <div style="font-family:sans-serif;line-height:1.6">
          <p>你正在使用 STLVault，本次操作的验证码是：</p>
          <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>
          <p>验证码 10 分钟内有效。若非本人操作，请忽略此邮件。</p>
        </div>
      `,
    });
  }
}
