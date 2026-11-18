"""模型列表接口，对应 Nest 版 /api/models。"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Model3D, ModelLike

router = APIRouter()


def _iso(dt: datetime | None) -> str | None:
    """把数据库里的 naive UTC 时间转成 Prisma 那种 2026-01-01T00:00:00.000Z 格式。"""
    if dt is None:
        return None
    return (
        dt.replace(tzinfo=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _serialize(model: Model3D, likes: int) -> dict:
    return {
        "id": model.id,
        "title": model.title,
        "description": model.description,
        "category": model.category,
        "image": model.image,
        "modelUrl": model.model_url,
        "createdAt": _iso(model.created_at),
        # 前端读的是 data._count.likes，和 Prisma 的返回结构保持一致
        "_count": {"likes": likes},
    }


def _like_count_subquery():
    return (
        select(ModelLike.model_id, func.count().label("total"))
        .group_by(ModelLike.model_id)
        .subquery()
    )


@router.get("")
async def list_models(
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    counts = _like_count_subquery()
    stmt = (
        select(Model3D, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.model_id == Model3D.id)
        .order_by(Model3D.id)
    )

    if category:
        stmt = stmt.where(Model3D.category == category)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                Model3D.title.ilike(pattern),
                Model3D.description.ilike(pattern),
            )
        )

    rows = (await db.execute(stmt)).all()
    return [_serialize(model, likes) for model, likes in rows]


@router.get("/{model_id}")
async def get_model(model_id: int, db: AsyncSession = Depends(get_db)):
    counts = _like_count_subquery()
    stmt = (
        select(Model3D, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.model_id == Model3D.id)
        .where(Model3D.id == model_id)
    )
    row = (await db.execute(stmt)).first()

    if row is None:
        raise HTTPException(status_code=404, detail=f"模型 #{model_id} 不存在")

    model, likes = row
    return _serialize(model, likes)
