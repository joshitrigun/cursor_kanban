from __future__ import annotations

import sqlite3

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from itsdangerous import BadSignature, URLSafeSerializer

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


def sign_session_username(request: Request, username: str) -> str:
    serializer: URLSafeSerializer = request.app.state.session_serializer
    return serializer.dumps(username)


def get_authenticated_username(request: Request) -> str | None:
    signed_cookie = request.cookies.get(SESSION_COOKIE_NAME)
    if not signed_cookie:
        return None

    serializer: URLSafeSerializer = request.app.state.session_serializer
    settings = get_settings(request)

    try:
        username = serializer.loads(signed_cookie)
    except BadSignature:
        return None

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
        secure=False,
        path="/",
    )
    return {"authenticated": True, "username": settings.auth_username}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
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
    payload: BoardEnvelope,
    db: sqlite3.Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
) -> dict[str, object]:
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
    _username: str = Depends(require_authenticated_username),
    client: OpenRouterClient = Depends(get_openrouter_client),
) -> dict[str, str]:
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
    payload: AIChatPayload,
    db: sqlite3.Connection = Depends(get_db_connection),
    username: str = Depends(require_authenticated_username),
    client: OpenRouterClient = Depends(get_openrouter_client),
) -> dict[str, object]:
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