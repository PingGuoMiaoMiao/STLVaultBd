"""ORM 模型：一一对应 Prisma schema，表和字段名保持一致。

这样做的好处是 Python 后端和 Nest 后端可以指向同一个数据库，
数据完全互通，不需要任何迁移脚本。
"""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(Text, unique=True)
    nickname: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    password: Mapped[str] = mapped_column(Text)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        "email_verified_at", DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        "created_at", DateTime, server_default=func.now()
    )


class VerificationCode(Base):
    """注册激活、找回密码共用一张表，用 purpose 区分场景。"""

    __tablename__ = "verification_codes"
    __table_args__ = (Index("verification_codes_email_purpose_idx", "email", "purpose"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column("expires_at", DateTime)
    consumed_at: Mapped[datetime | None] = mapped_column(
        "consumed_at", DateTime, nullable=True
    )
    attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        "created_at", DateTime, server_default=func.now()
    )


class Model3D(Base):
    """3D 模型。类名不能叫 Model，会和 Pydantic 的 BaseModel 混淆。"""

    __tablename__ = "models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 注意：Prisma schema 里 modelUrl 没有 @map，数据库列名就是驼峰 modelUrl
    model_url: Mapped[str | None] = mapped_column("modelUrl", Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at", DateTime, server_default=func.now()
    )


class ModelLike(Base):
    """点赞关系，联合主键 (user_id, model_id)。"""

    __tablename__ = "model_likes"

    user_id: Mapped[int] = mapped_column(
        "user_id",
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_id: Mapped[int] = mapped_column(
        "model_id",
        Integer,
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        "created_at", DateTime, server_default=func.now()
    )
