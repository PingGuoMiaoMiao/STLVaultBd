"""验证码逻辑：发码、冷却、作废旧码、校验、错误次数限制。

对应 Nest 版 src/verification/verification.service.ts。
"""

import random
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..mailer import send_verification_code
from ..models import VerificationCode

Purpose = Literal["register", "reset_password"]

CODE_TTL = timedelta(minutes=10)  # 有效期 10 分钟
RESEND_COOLDOWN = timedelta(seconds=60)  # 重发冷却 60 秒
MAX_ATTEMPTS = 5  # 最多试错 5 次


def utcnow() -> datetime:
    """统一用 UTC 的 naive datetime。

    数据库列是 TIMESTAMP WITHOUT TIME ZONE，写入前统一按 UTC 处理，
    避免服务器时区（这台机器是 Asia/Shanghai）带来的 8 小时偏差。
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _latest_active(
    db: AsyncSession, email: str, purpose: str
) -> VerificationCode | None:
    stmt = (
        select(VerificationCode)
        .where(
            VerificationCode.email == email,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc(), VerificationCode.id.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def issue_code(db: AsyncSession, email: str, purpose: Purpose) -> str:
    """生成 6 位验证码并发邮件，返回明文码（仅调试用）。"""
    now = utcnow()

    # 冷却检查：60 秒内不允许重复发
    latest = await _latest_active(db, email, purpose)
    if latest and latest.created_at and now - latest.created_at < RESEND_COOLDOWN:
        raise HTTPException(status_code=429, detail="请求过于频繁，请 60 秒后再试")

    # 旧码统一作废，保证同一时刻只有一个有效码
    await db.execute(
        update(VerificationCode)
        .where(
            VerificationCode.email == email,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )

    code = str(random.randint(100000, 999999))
    db.add(
        VerificationCode(
            email=email,
            code=code,
            purpose=purpose,
            expires_at=now + CODE_TTL,
            created_at=now,
            attempts=0,
        )
    )
    # 先落库再发信：邮件失败不影响「码已生成」，用户可以点重发
    await db.commit()

    await send_verification_code(email, code, purpose)
    return code


async def verify_code(
    db: AsyncSession, email: str, code: str, purpose: Purpose
) -> None:
    """校验验证码：过期 / 超次数 / 不匹配都抛 400；通过则标记已消费。"""
    now = utcnow()
    record = await _latest_active(db, email, purpose)

    if record is None:
        raise HTTPException(status_code=400, detail="请先获取验证码")

    if record.expires_at < now:
        raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")

    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="验证码错误次数过多，请重新获取")

    if record.code != code:
        # 记一次错误次数，防止暴力枚举
        record.attempts += 1
        await db.commit()
        raise HTTPException(status_code=400, detail="验证码错误")

    record.consumed_at = now
    await db.commit()
