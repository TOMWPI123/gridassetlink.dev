from functools import lru_cache
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


def default_database_url() -> str:
    if os.getenv("VERCEL"):
        return "sqlite:////tmp/telecomne_grid_asset_links.db"
    return "sqlite:///./telecomne_grid_asset_links.db"


class Settings(BaseSettings):
    app_name: str = "TelecomNE Grid Asset Links"
    database_url: str = default_database_url()
    secret_key: str = "change-this-local-development-secret"
    access_token_expire_minutes: int = 720
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,https://gridassetlink.dev,https://www.gridassetlink.dev"
    auto_seed: bool = True
    allow_admin_write_sql: bool = False
    auth_required: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
