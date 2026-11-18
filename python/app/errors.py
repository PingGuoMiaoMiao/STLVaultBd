"""把 FastAPI 的报错格式改成和 Nest 一致。

前端 readMessage() 读的是 data.message，并且能处理字符串数组。
所以这里统一输出：
    {"message": "...", "error": "Bad Request", "statusCode": 400}
"""

from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def _reason(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "Error"


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "message": exc.detail,
            "error": _reason(exc.status_code),
            "statusCode": exc.status_code,
        },
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    messages: list[str] = []
    for err in exc.errors():
        # loc 形如 ("body", "email")，去掉 body 前缀更好读
        field = ".".join(str(part) for part in err["loc"] if part != "body")
        messages.append(f"{field}: {err['msg']}" if field else err["msg"])

    return JSONResponse(
        status_code=400,
        content={
            "message": messages,
            "error": "Bad Request",
            "statusCode": 400,
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
