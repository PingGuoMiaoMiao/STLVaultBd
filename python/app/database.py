"""数据库连接：asyncpg 驱动 + SQLAlchemy 2.0 异步会话。"""

from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings


def _to_async_url(url: str) -> str:
    """把 Prisma 风格的连接串转换成 asyncpg 能用的形式。

    Prisma 的 URL 长这样：postgresql://user:pass@host:5432/db?schema=public
    asyncpg 不认 ?schema= 这个参数，必须去掉，否则启动就报错。
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    if url.startswith("postgresql://"):
        parts = urlsplit(url)
        query = [(k, v) for k, v in parse_qsl(parts.query) if k != "schema"]
        url = urlunsplit(
            (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
        )
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    return url


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    _to_async_url(get_settings().database_url),
    pool_pre_ping=True,  # 连接被数据库断掉后自动重连
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI 依赖注入：每个请求一个会话，用完自动归还连接。"""
    async with SessionLocal() as session:
        yield session
