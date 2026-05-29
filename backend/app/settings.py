from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_OPENROUTER_HTTP_REFERER = "http://localhost:8000"
DEFAULT_APP_NAME = "Project Management MVP"


@dataclass(frozen=True)
class AppSettings:
    auth_username: str = "user"
    auth_password: str = "password"
    session_secret: str = "pm-dev-session-secret"
    openrouter_api_key: str | None = None
    openrouter_model: str = DEFAULT_OPENROUTER_MODEL
    openrouter_base_url: str = DEFAULT_OPENROUTER_BASE_URL
    openrouter_http_referer: str = DEFAULT_OPENROUTER_HTTP_REFERER
    openrouter_app_name: str = DEFAULT_APP_NAME


def default_env_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


def load_app_settings(env_path: Path | None = None) -> AppSettings:
    load_dotenv(env_path or default_env_path())

    return AppSettings(
        auth_username=os.getenv("PM_AUTH_USERNAME", "user"),
        auth_password=os.getenv("PM_AUTH_PASSWORD", "password"),
        session_secret=os.getenv("PM_SESSION_SECRET", "pm-dev-session-secret"),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
        openrouter_model=os.getenv("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL),
        openrouter_base_url=os.getenv(
            "OPENROUTER_BASE_URL",
            DEFAULT_OPENROUTER_BASE_URL,
        ),
        openrouter_http_referer=os.getenv(
            "OPENROUTER_HTTP_REFERER",
            DEFAULT_OPENROUTER_HTTP_REFERER,
        ),
        openrouter_app_name=os.getenv("OPENROUTER_APP_NAME", DEFAULT_APP_NAME),
    )