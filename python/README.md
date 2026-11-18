# STLVault 后端 — Python / FastAPI 版

这是 `python` 分支，与 `main` 分支上的 NestJS 实现**功能完全对齐**：

- 同一套 PostgreSQL 表结构（`users` / `verification_codes` / `models` / `model_likes`）
- 同样的接口路径、请求字段、返回结构和错误格式
- 同样的 JWT 签名方式与 cookie 名（`stlvault_token`）
- 两边 bcrypt 哈希互相兼容，可以共用同一个数据库

前端不需要改任何一行代码，把 `/api` 指向这个服务即可。

## 目录结构

```
python/
├── app/
│   ├── main.py            # 入口：注册路由、CORS、错误处理、建表
│   ├── config.py          # 配置（读 .env）
│   ├── database.py        # 数据库连接（asyncpg + SQLAlchemy 异步会话）
│   ├── models.py          # ORM 模型（对应 Prisma schema）
│   ├── schemas.py         # 请求体校验（对应 Nest 的 DTO）
│   ├── security.py        # bcrypt 哈希 + JWT 签发/校验
│   ├── mailer.py          # 发验证码邮件
│   ├── errors.py          # 把报错格式改成和 Nest 一致
│   ├── routers/
│   │   ├── auth.py        # 对应 AuthController
│   │   └── models.py      # 对应 ModelsController
│   └── services/
│       └── verification.py# 对应 VerificationService
├── requirements.txt
└── .env.example
```

## 快速开始

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # 然后按实际情况改 DATABASE_URL / SMTP / JWT_SECRET
uvicorn app.main:app --reload --port 8000
```

- 交互式接口文档：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/api>

生产环境：

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

> SQLAlchemy 异步引擎 + asyncpg 不建议开多 worker 共享同一进程池，小站用一个 worker 足够。

## 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册建号并发送验证码 |
| POST | `/api/auth/verify-email` | 校验验证码，激活账号 |
| POST | `/api/auth/resend-code` | 重发验证码 |
| POST | `/api/auth/login` | 登录，写入 httpOnly cookie |
| GET | `/api/auth/me` | 当前登录用户 |
| POST | `/api/auth/logout` | 退出登录 |
| POST | `/api/auth/forgot-password` | 发送重置密码验证码 |
| POST | `/api/auth/reset-password` | 用验证码设置新密码 |
| GET | `/api/models` | 模型列表（`?category=` / `?q=`） |
| GET | `/api/models/{id}` | 模型详情 |

## 与 Nest 版的关键差异

| 方面 | Nest（main 分支） | Python（本分支） |
|---|---|---|
| 框架 | NestJS 12 | FastAPI |
| ORM | Prisma 7 | SQLAlchemy 2（异步） |
| 邮件 | nodemailer | aiosmtplib |
| 校验 | class-validator | Pydantic v2 |
| 建表 | Prisma Migrate | 启动时 `create_all`（表已存在则跳过） |

## 注意事项

1. **JWT_SECRET 必须和 Nest 版相同**，否则两边签发的 token 互不认。
2. **时间统一按 UTC 存储**。数据库列是 `TIMESTAMP WITHOUT TIME ZONE`，写入前统一 `datetime.now(timezone.utc)` 去掉时区，避免服务器时区造成 8 小时偏差。
3. **不要用 `uvicorn --reload` 跑生产**。
4. 验证码规则与 Nest 一致：10 分钟过期、60 秒重发冷却、最多试错 5 次。
