from __future__ import annotations

import re
from collections.abc import Callable
from time import monotonic
from typing import Any, Dict, Optional, Union
from urllib.parse import urlparse, urlsplit
from uuid import uuid4

import bcrypt
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.ai import (
    AIResponseValidationError,
    CARD_ENRICHMENT_SYSTEM_PROMPT,
    STRUCTURED_SYSTEM_PROMPT,
    build_card_enrichment_user_prompt,
    build_structured_user_prompt,
    parse_card_enrichment_response,
    parse_structured_assistant_response,
)
from app.db import (
    BoardNotFoundError,
    Connection,
    append_chat_exchange_for_username,
    get_board_for_username,
    get_chat_history_for_username,
    get_trip_for_user,
    get_user_for_auth,
    update_board_for_username,
    upsert_trip_for_user,
)
from app.openrouter import OpenRouterClient, OpenRouterConfigError
from app.schemas import (
    AIChatPayload,
    BoardEnvelope,
    ChatMessagePayload,
    LoginPayload,
    QuickAddPayload,
    TripPayload,
)
from app.settings import AppSettings

SESSION_COOKIE_NAME = "pm_session"

router = APIRouter(prefix="/api")


def get_settings(request: Request) -> AppSettings:
    return request.app.state.settings


def get_db_connection(request: Request) -> Connection:
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


def get_request_origin(request: Request) -> Optional[str]:
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


def get_authenticated_username(request: Request) -> Optional[str]:
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
    if not username:
        return None

    # Validate the user still exists in the database.
    db = get_db_connection(request)
    user_row = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user_row is None:
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
def read_session(
    request: Request,
    db: Connection = Depends(get_db_connection),
) -> dict[str, str | bool | None]:
    username = get_authenticated_username(request)
    if username is None:
        return {"authenticated": False, "username": None, "displayName": None}
    user_row = get_user_for_auth(db, username)
    display_name = user_row["display_name"] if user_row and user_row["display_name"] else username
    return {"authenticated": True, "username": username, "displayName": display_name}


@router.post("/login")
def login(
    request: Request,
    payload: LoginPayload,
    response: Response,
    db: Connection = Depends(get_db_connection),
) -> dict[str, str | bool]:
    settings = get_settings(request)
    enforce_rate_limit(
        request,
        bucket="login",
        limit=settings.login_rate_limit_attempts,
        window_seconds=settings.login_rate_limit_window_seconds,
        key=get_client_identifier(request),
    )

    user_row = get_user_for_auth(db, payload.username)
    if user_row is None or not user_row["hashed_password"] or not bcrypt.checkpw(
        payload.password.encode(), user_row["hashed_password"].encode()
    ):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {
            "authenticated": False,
            "message": "Invalid username or password.",
        }

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sign_session_username(request, user_row["username"]),
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        max_age=settings.session_max_age_seconds,
        path="/",
    )
    return {"authenticated": True, "username": user_row["username"]}


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
    db: Connection = Depends(get_db_connection),
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
    db: Connection = Depends(get_db_connection),
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
    db: Connection = Depends(get_db_connection),
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
    db: Connection = Depends(get_db_connection),
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
        trip = get_trip_for_user(db, username)
        prompt = build_structured_user_prompt(
            current_board["board"],
            chat_history,
            payload.message,
            trip,
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


@router.get("/trip")
def read_trip(
    db: Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
) -> dict[str, object]:
    trip = get_trip_for_user(db, username)
    return trip or {"name": "", "destination": "", "startDate": None, "endDate": None}


@router.put("/trip")
def update_trip(
    request: Request,
    payload: TripPayload,
    db: Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
) -> dict[str, object]:
    validate_authenticated_origin(request)
    try:
        return upsert_trip_for_user(
            db,
            username,
            payload.name,
            payload.destination,
            payload.startDate,
            payload.endDate,
        )
    except BoardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


def _is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


async def _fetch_og_metadata(url: str) -> dict[str, str]:
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as http_client:
            response = await http_client.get(
                url, headers={"User-Agent": "Mozilla/5.0 (compatible; VacationPlanner/1.0)"}
            )
            if not response.is_success:
                return {}
            html = response.text

        og_data: dict[str, str] = {}
        for prop, key in [
            ("og:title", "title"),
            ("og:description", "description"),
            ("og:site_name", "site_name"),
        ]:
            match = re.search(
                rf'<meta[^>]+property=["\']?{re.escape(prop)}["\']?[^>]+content=["\']([^"\']+)["\']',
                html,
                re.IGNORECASE,
            )
            if match:
                og_data[key] = match.group(1)
        return og_data
    except Exception:
        return {}


@router.post("/cards/quick-add")
async def quick_add_card(
    request: Request,
    payload: QuickAddPayload,
    db: Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
    client: OpenRouterClient = Depends(get_openrouter_client),
) -> dict[str, object]:
    validate_authenticated_origin(request)

    try:
        board_data = get_board_for_username(db, username)
    except BoardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    board = board_data["board"]

    user_row = get_user_for_auth(db, username)
    display_name = user_row["display_name"] if user_row and user_row["display_name"] else username

    card_id = f"card-{uuid4().hex[:8]}"
    raw_title = payload.text.strip() if payload.text.strip() else payload.url.strip()
    card: dict[str, object] = {
        "id": card_id,
        "title": raw_title[:80],
        "details": "",
        "suggested_by": display_name,
        "status": "idea",
    }
    if payload.url.strip():
        card["content_url"] = payload.url.strip()

    unscheduled_col = next(
        (col for col in board["columns"] if col["id"] == "col-unscheduled"),
        board["columns"][0] if board["columns"] else None,
    )
    if unscheduled_col:
        unscheduled_col["cardIds"].insert(0, card_id)
    board["cards"][card_id] = card

    if payload.url.strip() and _is_safe_url(payload.url.strip()):
        try:
            og_data = await _fetch_og_metadata(payload.url.strip())
            enrichment_prompt = build_card_enrichment_user_prompt(payload.url.strip(), og_data)
            raw_response = await client.chat(
                user_message=enrichment_prompt,
                system_prompt=CARD_ENRICHMENT_SYSTEM_PROMPT,
            )
            enrichment = parse_card_enrichment_response(raw_response)
            if enrichment["title"]:
                card["title"] = enrichment["title"]
                card["ai_title"] = enrichment["title"]
            if enrichment["summary"]:
                card["details"] = enrichment["summary"]
                card["ai_summary"] = enrichment["summary"]
            if enrichment["tag"]:
                card["ai_tag"] = enrichment["tag"]
        except Exception:
            pass  # Enrichment failure is non-fatal; card is saved without enrichment

    updated = update_board_for_username(db, username, board)
    return {**updated, "cardId": card_id}