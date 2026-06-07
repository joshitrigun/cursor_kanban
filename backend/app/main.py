from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter, monotonic
from typing import Optional, Union

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import URLSafeTimedSerializer

from app.api import SESSION_COOKIE_NAME, router as api_router
from app.db import connect, default_db_path, initialize_database
from app.openrouter import OpenRouterClient, load_openrouter_settings
from app.settings import load_app_settings

frontend_out_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = connect(app.state.db_path)
    initialize_database(app.state.db)
    app.state.rate_limit_store = {}
    app.state.rate_limit_clock = monotonic
    try:
        yield
    finally:
        app.state.db.close()


def create_app(db_path: Optional[Union[str, Path]] = None) -> FastAPI:
    app = FastAPI(title="Project Management MVP", lifespan=lifespan)
    app.state.db_path = db_path  # None = auto (Postgres if DATABASE_URL set, else default SQLite)
    app.state.settings = load_app_settings()
    app.state.session_serializer = URLSafeTimedSerializer(
        app.state.settings.session_secret,
        salt=SESSION_COOKIE_NAME,
    )
    app.state.openrouter_settings = load_openrouter_settings(app.state.settings)
    app.state.openrouter_client = OpenRouterClient(app.state.openrouter_settings)

    cors_origins = list(app.state.settings.trusted_origins)
    if app.state.settings.is_development:
        cors_origins.append("http://localhost:3000")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        started_at = perf_counter()
        response = await call_next(request)
        duration_ms = (perf_counter() - started_at) * 1000
        response.headers.setdefault("Server-Timing", f"app;dur={duration_ms:.1f}")
        response.headers.setdefault("X-Response-Time-ms", f"{duration_ms:.1f}")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if app.state.settings.session_cookie_secure:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response

    app.include_router(api_router)

    if frontend_out_dir.exists():
        app.mount("/", StaticFiles(directory=frontend_out_dir, html=True), name="frontend")
    else:

        @app.get("/", response_class=HTMLResponse)
        def read_root() -> str:
            return """
            <!DOCTYPE html>
            <html lang=\"en\">
              <head>
                <meta charset=\"utf-8\" />
                <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
                <title>Project Management MVP</title>
                <style>
                  body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background: #f4f7fb;
                    color: #032147;
                  }

                  main {
                    max-width: 720px;
                    margin: 4rem auto;
                    padding: 2rem;
                    background: #ffffff;
                    border: 1px solid #d6e2ef;
                    border-radius: 20px;
                    box-shadow: 0 18px 50px rgba(3, 33, 71, 0.08);
                  }

                  h1 {
                    margin-top: 0;
                  }

                  code {
                    background: #eef4fb;
                    padding: 0.2rem 0.4rem;
                    border-radius: 6px;
                  }
                </style>
              </head>
              <body>
                <main>
                  <p>Scaffold ready</p>
                  <h1>Project Management MVP</h1>
                  <p>The FastAPI backend is running. The Kanban frontend will replace this placeholder in the next phase.</p>
                  <p>Health check: <code>/api/health</code></p>
                </main>
              </body>
            </html>
            """

    return app


app = create_app()