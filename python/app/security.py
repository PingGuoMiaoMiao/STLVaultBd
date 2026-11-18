"""密码哈希与 JWT 签发/校验。

和 Nest 版保持二进制兼容：
- bcrypt 用的都是 $2b$ 前缀，Nest 建的密码 Python 能验，反之亦然
- JWT 用 HS256，payload 里只有 sub（用户 id）和 exp，两边共用 JWT_SECRET
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

ALGORITHM = "HS256"
BCRYPT_ROUNDS = 10


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode()


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # 哈希格式不对（比如历史脏数据）时当作密码错误处理
        return False


def create_token(user_id: int) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.jwt_expires_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> int:
    """校验失败会抛 jwt.InvalidTokenError，由调用方转成 401。"""
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[ALGORITHM],
        # PyJWT 2.10 起会强制 sub 必须是字符串，但 Nest 签的是数字，
        # 关掉这项校验才能和 Nest 签发的 token 互通
        options={"verify_sub": False},
    )
    return int(payload["sub"])


def cookie_max_age() -> int:
    return get_settings().jwt_expires_days * 24 * 60 * 60
