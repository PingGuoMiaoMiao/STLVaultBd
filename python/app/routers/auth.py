"""认证接口，路径和 Nest 版完全一致（统一前缀 /api/auth）。"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..schemas import (
    ForgotPasswordIn,
    LoginIn,
    RegisterIn,
    ResendCodeIn,
    ResetPasswordIn,
    VerifyEmailIn,
)
from ..security import (
    cookie_max_age,
    create_token,
    decode_token,
    hash_password,
    verify_password,
)
from ..services.verification import issue_code, verify_code

router = APIRouter()

AUTH_COOKIE = "stlvault_token"


def public_user(user: User) -> dict:
    """对外字段白名单：永远不返回 password。"""
    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "email": user.email,
    }


async def _find_by_email(db: AsyncSession, email: str) -> User | None:
    return (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()


@router.post("/register", status_code=201)
async def register(payload: RegisterIn, db: AsyncSession = Depends(get_db)):
    exists = (
        await db.execute(
            select(User).where(
                or_(User.username == payload.username, User.email == payload.email)
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="用户名或邮箱已被注册")

    user = User(
        username=payload.username,
        nickname=payload.nickname,
        email=payload.email,
        phone=payload.phone,
        password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # 邮件发送失败不推翻注册：账号已建好，用户可以点「重发验证码」
    code_sent = True
    try:
        await issue_code(db, user.email, "register")
    except Exception:  # noqa: BLE001 - 任何发送异常都只降级为 codeSent=false
        code_sent = False

    return {**public_user(user), "codeSent": code_sent}


@router.post("/verify-email", status_code=201)
async def verify_email(payload: VerifyEmailIn, db: AsyncSession = Depends(get_db)):
    user = await _find_by_email(db, payload.email)
    if user is None:
        raise HTTPException(status_code=404, detail="该邮箱未注册")

    # 已激活过就直接返回，保证接口幂等
    if user.email_verified_at is not None:
        return {**public_user(user), "alreadyVerified": True}

    await verify_code(db, payload.email, payload.code, "register")

    from ..services.verification import utcnow

    user.email_verified_at = utcnow()
    await db.commit()
    await db.refresh(user)

    return {**public_user(user), "alreadyVerified": False}


@router.post("/resend-code", status_code=201)
async def resend_code(payload: ResendCodeIn, db: AsyncSession = Depends(get_db)):
    user = await _find_by_email(db, payload.email)

    if payload.purpose == "register":
        if user is None:
            raise HTTPException(status_code=404, detail="该邮箱未注册")
        if user.email_verified_at is not None:
            raise HTTPException(status_code=400, detail="该邮箱已验证，无需重发")
    elif user is None:
        # 找回密码：邮箱不存在也返回成功，防止被用来探测注册情况
        return {"ok": True}

    await issue_code(db, payload.email, payload.purpose)
    return {"ok": True}


@router.post("/login", status_code=201)
async def login(
    payload: LoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await _find_by_email(db, payload.email)
    # 用户不存在与密码错误用同一文案，防用户枚举
    if user is None:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if user.email_verified_at is None:
        raise HTTPException(status_code=403, detail="邮箱尚未验证，请先完成邮箱验证")

    response.set_cookie(
        key=AUTH_COOKIE,
        value=create_token(user.id),
        max_age=cookie_max_age(),
        httponly=True,  # JS 读不到，防 XSS 窃取
        samesite="lax",  # 防止 CSRF 跨站提交
        secure=False,  # 本地 http；上线 https 后改 True
        path="/",
    )
    return public_user(user)


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(AUTH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="未登录")

    try:
        user_id = decode_token(token)
    except Exception:  # noqa: BLE001 - 过期、签名不对都算未登录
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="账号不存在")

    return public_user(user)


@router.post("/logout", status_code=201)
async def logout(response: Response):
    response.delete_cookie(AUTH_COOKIE, path="/")
    return {"ok": True}


@router.post("/forgot-password", status_code=201)
async def forgot_password(
    payload: ForgotPasswordIn, db: AsyncSession = Depends(get_db)
):
    user = await _find_by_email(db, payload.email)
    if user is not None:
        try:
            await issue_code(db, payload.email, "reset_password")
        except Exception:  # noqa: BLE001 - 60 秒内重复请求静默忽略，避免暴露邮箱是否存在
            pass
    return {"ok": True}


@router.post("/reset-password", status_code=201)
async def reset_password(
    payload: ResetPasswordIn, db: AsyncSession = Depends(get_db)
):
    user = await _find_by_email(db, payload.email)
    if user is None:
        raise HTTPException(status_code=400, detail="验证码无效")

    await verify_code(db, payload.email, payload.code, "reset_password")

    user.password = hash_password(payload.newPassword)
    await db.commit()

    return {"ok": True}
