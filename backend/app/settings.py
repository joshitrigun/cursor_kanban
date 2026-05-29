from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_OPENROUTER_HTTP_REFERER = "http://localhost:8000"
DEFAULT_APP_NAME = "Project Management MVP"
DEFAULT_AUTH_PASSWORD = "password"
DEFAULT_SESSION_SECRET = "pm-dev-session-secret"
DEFAULT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60
DEVELOPMENT_ENVIRONMENTS = {"development", "test"}
DEFAULT_LOGIN_RATE_LIMIT_ATTEMPTS = 5
DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60
DEFAULT_AI_RATE_LIMIT_ATTEMPTS = 10
DEFAULT_AI_RATE_LIMIT_WINDOW_SECONDS = 60


class AppSettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class AppSettings:
    app_env: str = "development"
    auth_username: str = "user"
    auth_password: str = DEFAULT_AUTH_PASSWORD
    session_secret: str = DEFAULT_SESSION_SECRET
    session_cookie_secure: bool = False
    session_max_age_seconds: int = DEFAULT_SESSION_MAX_AGE_SECONDS
    trusted_origins: tuple[str, ...] = ()
    login_rate_limit_attempts: int = DEFAULT_LOGIN_RATE_LIMIT_ATTEMPTS
    login_rate_limit_window_seconds: int = DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS
    ai_rate_limit_attempts: int = DEFAULT_AI_RATE_LIMIT_ATTEMPTS
    ai_rate_limit_window_seconds: int = DEFAULT_AI_RATE_LIMIT_WINDOW_SECONDS
    openrouter_api_key: str | None = None
    openrouter_model: str = DEFAULT_OPENROUTER_MODEL
    openrouter_base_url: str = DEFAULT_OPENROUTER_BASE_URL
    openrouter_http_referer: str = DEFAULT_OPENROUTER_HTTP_REFERER
    openrouter_app_name: str = DEFAULT_APP_NAME

    @property
    def is_development(self) -> bool:
        return self.app_env in DEVELOPMENT_ENVIRONMENTS


def default_env_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


def parse_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_origins_env(name: str) -> tuple[str, ...]:
    value = os.getenv(name, "")
    if not value.strip():
        return ()

    return tuple(
        origin.strip().rstrip("/")
        for origin in value.split(",")
        if origin.strip()
    )


def validate_app_settings(settings: AppSettings) -> AppSettings:
    if settings.is_development:
        return settings

    if (
        "PM_AUTH_PASSWORD" not in os.environ
        or settings.auth_password == DEFAULT_AUTH_PASSWORD
    ):
        raise AppSettingsError(
            "PM_AUTH_PASSWORD must be explicitly set to a non-default value outside development.")

    if (
        "PM_SESSION_SECRET" not in os.environ
        or settings.session_secret == DEFAULT_SESSION_SECRET
        or len(settings.session_secret) < 32
    ):
        raise AppSettingsError(
            "PM_SESSION_SECRET must be explicitly set to a strong non-default value outside development.")

    return settings


def load_app_settings(env_path: Path | None = None) -> AppSettings:
    app_env = os.getenv("PM_ENV", "development").strip().lower() or "development"
    if app_env in DEVELOPMENT_ENVIRONMENTS:
        load_dotenv(env_path or default_env_path())
        app_env = os.getenv("PM_ENV", app_env).strip().lower() or app_env

    session_cookie_secure = parse_bool_env(
        "PM_SESSION_COOKIE_SECURE",
        default=app_env not in DEVELOPMENT_ENVIRONMENTS,
    )

    settings = AppSettings(
        app_env=app_env,
        auth_username=os.getenv("PM_AUTH_USERNAME", "user"),
        auth_password=os.getenv("PM_AUTH_PASSWORD", DEFAULT_AUTH_PASSWORD),
        session_secret=os.getenv("PM_SESSION_SECRET", DEFAULT_SESSION_SECRET),
        session_cookie_secure=session_cookie_secure,
        session_max_age_seconds=int(
            os.getenv("PM_SESSION_MAX_AGE_SECONDS", str(DEFAULT_SESSION_MAX_AGE_SECONDS))
        ),
        trusted_origins=parse_origins_env("PM_TRUSTED_ORIGINS"),
        login_rate_limit_attempts=int(
            os.getenv(
                "PM_LOGIN_RATE_LIMIT_ATTEMPTS",
                str(DEFAULT_LOGIN_RATE_LIMIT_ATTEMPTS),
            )
        ),
        login_rate_limit_window_seconds=int(
            os.getenv(
                "PM_LOGIN_RATE_LIMIT_WINDOW_SECONDS",
                str(DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS),
            )
        ),
        ai_rate_limit_attempts=int(
            os.getenv(
                "PM_AI_RATE_LIMIT_ATTEMPTS",
                str(DEFAULT_AI_RATE_LIMIT_ATTEMPTS),
            )
        ),
        ai_rate_limit_window_seconds=int(
            os.getenv(
                "PM_AI_RATE_LIMIT_WINDOW_SECONDS",
                str(DEFAULT_AI_RATE_LIMIT_WINDOW_SECONDS),
            )
        ),
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

    return validate_app_settings(settings)