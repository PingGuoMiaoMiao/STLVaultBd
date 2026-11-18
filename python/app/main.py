"""FastAPI 入口。启动命令：

    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Base, engine
from .errors import register_error_handlers
from .routers import auth, models

logging.basicConfig(level=logging.INFO)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 表已存在时是空操作；只有全新数据库才会按 ORM 定义建表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="STLVault API (Python)",
    version="1.0.0",
    lifespan=lifespan,
)

# 和 Nest 版一样：允许带 cookie 的跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(models.router, prefix="/api/models", tags=["models"])


@app.get("/api", tags=["health"])
async def root():
    return "Hello World!"
