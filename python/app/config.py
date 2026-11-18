"""全局配置：统一从环境变量 / python/.env 读取。"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # extra="ignore" 让 .env 里多出来的 Nest 变量（如 NODE_ENV）不报错
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@127.0.0.1:5432/stlvault"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expires_days: int = 7

    port: int = 8000
    cors_origins: str = "http://localhost:3000"

    smtp_host: str | None = None
    smtp_port: int = 465
    smtp_user: str | None = None
    smtp_pass: str | None = None
    mail_from: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        """逗号分隔的来源拆成列表，和 Nest 的 CORS_ORIGINS 语义一致。"""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_pass)


@lru_cache
def get_settings() -> Settings:
    """只实例化一次，避免每次请求都读文件。"""
    return Settings()
