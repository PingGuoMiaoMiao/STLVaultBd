"""请求体模型：对应 Nest 里 src/auth/dto 下的那些 class-validator DTO。"""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    username: str = Field(min_length=1)
    nickname: str = Field(min_length=1)
    email: EmailStr
    phone: str | None = None
    password: str = Field(min_length=6)


class VerifyEmailIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendCodeIn(BaseModel):
    email: EmailStr
    purpose: Literal["register", "reset_password"]


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    # 字段名保持 camelCase，前端传的就是 newPassword
    newPassword: str = Field(min_length=6)
