from __future__ import annotations

import sqlite3
from collections.abc import Callable
from time import monotonic
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.ai import (
    AIResponseValidationError,
    STRUCTURED_SYSTEM_PROMPT,
    build_structured_user_prompt,
    parse_structured_assistant_response,
)
from app.db import (
    BoardNotFoundError,
    append_chat_exchange_for_username,
    get_board_for_username,
    get_chat_history_for_username,
    update_board_for_username,
)
from app.openrouter import OpenRouterClient, OpenRouterConfigError
from app.schemas import AIChatPayload, BoardEnvelope, ChatMessagePayload, LoginPayload
from app.settings import AppSettings

SESSION_COOKIE_NAME = "pm_session"

router = APIRouter(prefix="/api")


def get_settings(request: Request) -> AppSettings:
    return request.app.state.settings


def get_db_connection(request: Request) -> sqlite3.Connection:
    return request.app.state.db


def get_openrouter_client(request: Request) -> OpenRouterClient:
    return request.app.state.openrouter_client


def get_rate_limit_store(request: Request) -> dict[str, list[float]]:
    return request.app.state.rate_limit_store


def get_rate_limit_clock(request: Request) -> Callable[[], float]:
    return getattr(request.app.state, "rate_limit_clock", monotonic)


def get_client_identifier(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_rate_limit(
    request: Request,
    *,
    bucket: str,
    limit: int,
    window_seconds: int,
    key: str,
) -> None:
    store = get_rate_limit_store(request)
    now = get_rate_limit_clock(request)()
    threshold = now - window_seconds
    store_key = f"{bucket}:{key}"
    recent_attempts = [timestamp for timestamp in store.get(store_key, []) if timestamp > threshold]
    if len(recent_attempts) >= limit:
        retry_after = max(1, int(window_seconds - (now - recent_attempts[0])))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    recent_attempts.append(now)
    store[store_key] = recent_attempts


def sign_session_username(request: Request, username: str) -> str:
    serializer: URLSafeTimedSerializer = request.app.state.session_serializer
    return serializer.dumps({"username": username, "session_id": uuid4().hex})


def get_request_origin(request: Request) -> str | None:
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")

    referer = request.headers.get("referer")
    if not referer:
        return None

    parsed = urlsplit(referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def validate_authenticated_origin(request: Request) -> None:
    settings = get_settings(request)
    origin = get_request_origin(request)
    if origin is None:
        if settings.is_development:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Origin or Referer header required.",
        )

    allowed_origins = {str(request.base_url).rstrip("/")}
    allowed_origins.update(settings.trusted_origins)
    if origin not in allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Untrusted request origin.",
        )


def get_authenticated_username(request: Request) -> str | None:
    signed_cookie = request.cookies.get(SESSION_COOKIE_NAME)
    if not signed_cookie:
        return None

    serializer: URLSafeTimedSerializer = request.app.state.session_serializer
    settings = get_settings(request)

    try:
        payload = serializer.loads(
            signed_cookie,
            max_age=settings.session_max_age_seconds,
        )
    except (BadSignature, SignatureExpired):
        return None

    username = payload.get("username") if isinstance(payload, dict) else None
    if username != settings.auth_username:
        return None

    return username


def require_authenticated_username(request: Request) -> str:
    username = get_authenticated_username(request)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return username


@router.get("/health")
def read_health() -> dict[str, str]:
    return {"status": "ok", "service": "backend"}


@router.get("/session")
def read_session(request: Request) -> dict[str, str | bool | None]:
    username = get_authenticated_username(request)
    return {
        "authenticated": username is not None,
        "username": username,
    }


@router.post("/login")
def login(
    request: Request,
    payload: LoginPayload,
    response: Response,
) -> dict[str, str | bool]:
    settings = get_settings(request)
    enforce_rate_limit(
        request,
        bucket="login",
        limit=settings.login_rate_limit_attempts,
        window_seconds=settings.login_rate_limit_window_seconds,
        key=get_client_identifier(request),
    )
    if (
        payload.username != settings.auth_username
        or payload.password != settings.auth_password
    ):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {
            "authenticated": False,
            "message": "Invalid username or password.",
        }

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sign_session_username(request, settings.auth_username),
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        max_age=settings.session_max_age_seconds,
        path="/",
    )
    return {"authenticated": True, "username": settings.auth_username}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    _username: str = Depends(require_authenticated_username),
) -> Response:
    validate_authenticated_origin(request)
    settings = get_settings(request)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value="",
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        max_age=0,
        path="/",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/board")
def read_board(
    db: sqlite3.Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
) -> dict[str, object]:
    try:
        return get_board_for_username(db, username)
    except BoardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/board")
def update_board(
    request: Request,
    payload: BoardEnvelope,
    db: sqlite3.Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
) -> dict[str, object]:
    validate_authenticated_origin(request)
    try:
        return update_board_for_username(
            db,
            username,
            payload.board.model_dump(mode="json"),
        )
    except BoardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/chat-history")
def read_chat_history(
    db: sqlite3.Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
) -> dict[str, list[dict[str, str]]]:
    try:
        messages = [
            ChatMessagePayload.model_validate(message).model_dump(mode="json")
            for message in get_chat_history_for_username(db, username)
        ]
        return {"messages": messages}
    except BoardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/ai/connectivity-test")
async def run_ai_connectivity_test(
    request: Request,
    _username: str = Depends(require_authenticated_username),
    client: OpenRouterClient = Depends(get_openrouter_client),
) -> dict[str, str]:
    validate_authenticated_origin(request)
    settings = get_settings(request)
    enforce_rate_limit(
        request,
        bucket="ai",
        limit=settings.ai_rate_limit_attempts,
        window_seconds=settings.ai_rate_limit_window_seconds,
        key=get_authenticated_username(request) or get_client_identifier(request),
    )
    try:
        return await client.run_connectivity_test()
    except OpenRouterConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenRouter connectivity test failed.",
        ) from exc


@router.post("/ai/chat")
async def run_ai_chat(
    request: Request,
    payload: AIChatPayload,
    db: sqlite3.Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
    client: OpenRouterClient = Depends(get_openrouter_client),
) -> dict[str, object]:
    validate_authenticated_origin(request)
    settings = get_settings(request)
    enforce_rate_limit(
        request,
        bucket="ai",
        limit=settings.ai_rate_limit_attempts,
        window_seconds=settings.ai_rate_limit_window_seconds,
        key=username,
    )
    try:
        current_board = get_board_for_username(db, username)
        chat_history = get_chat_history_for_username(db, username)
        prompt = build_structured_user_prompt(
            current_board["board"],
            chat_history,
            payload.message,
        )
    except BoardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        raw_response = await client.chat(
            user_message=prompt,
            system_prompt=STRUCTURED_SYSTEM_PROMPT,
        )
        structured_response = parse_structured_assistant_response(raw_response)
    except OpenRouterConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except AIResponseValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI chat request failed.",
        ) from exc

    response_payload = current_board
    board_mutation = None
    if structured_response.board is not None:
        board_mutation = structured_response.board.model_dump(mode="json")
        response_payload = update_board_for_username(
            db,
            username,
            board_mutation,
        )

    append_chat_exchange_for_username(
        db,
        username,
        payload.message,
        structured_response.assistantMessage,
        board_mutation,
    )

    return {
        "assistantMessage": structured_response.assistantMessage,
        "boardUpdated": board_mutation is not None,
        **response_payload,
    }