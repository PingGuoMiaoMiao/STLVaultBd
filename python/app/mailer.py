"""发验证码邮件。没配 SMTP 时退化成打日志，方便本地调试。"""

import logging
from email.message import EmailMessage

import aiosmtplib

from .config import get_settings

logger = logging.getLogger(__name__)

TITLES = {
    "register": "注册验证码",
    "reset_password": "重置密码验证码",
}


async def send_verification_code(email: str, code: str, purpose: str) -> None:
    settings = get_settings()
    title = TITLES.get(purpose, "注册验证码")

    if not settings.smtp_configured:
        logger.warning("[DEV] %s 的%s: %s", email, title, code)
        return

    html = f"""
    <div style="font-family:sans-serif;line-height:1.6">
      <p>你正在使用 STLVault，本次操作的验证码是：</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:16px 0">{code}</p>
      <p>验证码 10 分钟内有效。若非本人操作，请忽略此邮件。</p>
    </div>
    """

    message = EmailMessage()
    message["From"] = settings.mail_from or settings.smtp_user or ""
    message["To"] = email
    message["Subject"] = f"【STLVault】{title}"
    message.set_content(f"你正在使用 STLVault，本次操作的验证码是：{code}，10 分钟内有效。")
    message.add_alternative(html, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user,
        password=settings.smtp_pass,
        use_tls=settings.smtp_port == 465,  # 465 走 SSL
        start_tls=settings.smtp_port == 587,  # 587 走 STARTTLS
        timeout=15,
    )
