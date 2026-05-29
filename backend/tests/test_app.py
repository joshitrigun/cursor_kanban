from pathlib import Path

import sqlite3
import pytest
from fastapi.testclient import TestClient
import app.db as db_module

from app.db import get_chat_history_for_username
from app.main import create_app
from app.openrouter import OpenRouterConfigError
from app.settings import AppSettingsError


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


def test_root_returns_placeholder_html(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Kanban Studio" in response.text
    assert "<html" in response.text


def test_health_route_returns_ok_payload(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "backend"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_static_asset_is_served(client: TestClient) -> None:
    response = client.get("/favicon.ico")

    assert response.status_code == 200


def test_session_defaults_to_unauthenticated(client: TestClient) -> None:
    response = client.get("/api/session")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "username": None}


def test_login_sets_authenticated_session_cookie(client: TestClient) -> None:
    response = client.post(
        "/api/login",
        json={"username": "user", "password": "password"},
    )

    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "username": "user"}
    assert response.cookies.get("pm_session") is not None
    assert response.cookies.get("pm_session") != "user"
    assert "Max-Age=28800" in response.headers["set-cookie"]

    session_response = client.get("/api/session")
    assert session_response.json() == {"authenticated": True, "username": "user"}


def test_login_rate_limit_returns_429_after_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_LOGIN_RATE_LIMIT_ATTEMPTS", "2")
    monkeypatch.setenv("PM_LOGIN_RATE_LIMIT_WINDOW_SECONDS", "60")

    with TestClient(create_app()) as client:
        first_response = client.post(
            "/api/login",
            json={"username": "user", "password": "wrong"},
        )
        second_response = client.post(
            "/api/login",
            json={"username": "user", "password": "wrong"},
        )
        third_response = client.post(
            "/api/login",
            json={"username": "user", "password": "wrong"},
        )

    assert first_response.status_code == 401
    assert second_response.status_code == 401
    assert third_response.status_code == 429
    assert int(third_response.headers["retry-after"]) in {59, 60}


def test_login_rotates_session_cookie(client: TestClient) -> None:
    first_response = client.post(
        "/api/login",
        json={"username": "user", "password": "password"},
    )
    second_response = client.post(
        "/api/login",
        json={"username": "user", "password": "password"},
    )

    assert first_response.cookies.get("pm_session") != second_response.cookies.get("pm_session")


def test_tampered_session_cookie_is_rejected(client: TestClient) -> None:
    client.cookies.set("pm_session", "user")

    session_response = client.get("/api/session")
    board_response = client.get("/api/board")

    assert session_response.json() == {"authenticated": False, "username": None}
    assert board_response.status_code == 401


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/login",
        json={"username": "user", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {
        "authenticated": False,
        "message": "Invalid username or password.",
    }


def test_logout_clears_session_cookie(client: TestClient) -> None:
    client.post(
        "/api/login",
        json={"username": "user", "password": "password"},
    )

    response = client.post("/api/logout", headers={"Origin": "http://testserver"})

    assert response.status_code == 204
    session_response = client.get("/api/session")
    assert session_response.json() == {"authenticated": False, "username": None}


def test_database_is_created_on_startup(db_path: Path, client: TestClient) -> None:
    with TestClient(create_app(db_path)):
        assert db_path.exists()

    with sqlite3.connect(db_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

    assert {"users", "boards", "chat_messages"}.issubset(tables)


def test_board_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/board")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_chat_history_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/chat-history")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_authenticated_user_gets_seeded_board(client: TestClient) -> None:
    client.post("/api/login", json={"username": "user", "password": "password"})

    response = client.get("/api/board")

    assert response.status_code == 200
    payload = response.json()
    assert payload["boardVersion"] == 1
    assert payload["schemaVersion"] == 1
    assert len(payload["board"]["columns"]) == 5
    assert payload["board"]["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_board_update_persists_and_increments_version(client: TestClient) -> None:
    client.post("/api/login", json={"username": "user", "password": "password"})
    initial_board = client.get("/api/board").json()["board"]
    updated_board = {
        **initial_board,
        "columns": [
            {
                **initial_board["columns"][0],
                "title": "Ready to Build",
            },
            *initial_board["columns"][1:],
        ],
    }

    update_response = client.put(
        "/api/board",
        json={"board": updated_board},
        headers={"Origin": "http://testserver"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["boardVersion"] == 2
    assert update_response.json()["board"]["columns"][0]["title"] == "Ready to Build"

    persisted_response = client.get("/api/board")
    assert persisted_response.json()["boardVersion"] == 2
    assert persisted_response.json()["board"]["columns"][0]["title"] == "Ready to Build"


def test_board_persists_across_app_restarts(db_path: Path) -> None:
    with TestClient(create_app(db_path)) as first_client:
        first_client.post("/api/login", json={"username": "user", "password": "password"})
        board = first_client.get("/api/board").json()["board"]
        updated_board = {
            **board,
            "columns": [
                {
                    **board["columns"][0],
                    "title": "Persisted Column",
                },
                *board["columns"][1:],
            ],
        }
        first_client.put(
            "/api/board",
            json={"board": updated_board},
            headers={"Origin": "http://testserver"},
        )

    with TestClient(create_app(db_path)) as second_client:
        second_client.post("/api/login", json={"username": "user", "password": "password"})
        response = second_client.get("/api/board")

    assert response.status_code == 200
    assert response.json()["boardVersion"] == 2
    assert response.json()["board"]["columns"][0]["title"] == "Persisted Column"


@pytest.mark.anyio
async def test_ai_connectivity_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/connectivity-test")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


@pytest.mark.anyio
async def test_ai_connectivity_returns_backend_only_result(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def run_connectivity_test(self) -> dict[str, str]:
            return {
                "model": "openai/gpt-oss-120b",
                "prompt": "What is 2+2? Respond with digits only.",
                "reply": "4",
            }

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "user", "password": "password"})

    response = client.post(
        "/api/ai/connectivity-test",
        headers={"Origin": "http://testserver"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "model": "openai/gpt-oss-120b",
        "prompt": "What is 2+2? Respond with digits only.",
        "reply": "4",
    }


@pytest.mark.anyio
async def test_ai_connectivity_handles_missing_key(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def run_connectivity_test(self) -> dict[str, str]:
            raise OpenRouterConfigError("OPENROUTER_API_KEY is not configured.")

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "user", "password": "password"})

    response = client.post(
        "/api/ai/connectivity-test",
        headers={"Origin": "http://testserver"},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "OPENROUTER_API_KEY is not configured."}


@pytest.mark.anyio
async def test_ai_rate_limit_returns_429_after_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_AI_RATE_LIMIT_ATTEMPTS", "1")
    monkeypatch.setenv("PM_AI_RATE_LIMIT_WINDOW_SECONDS", "60")

    class StubOpenRouterClient:
        async def run_connectivity_test(self) -> dict[str, str]:
            return {
                "model": "openai/gpt-oss-120b",
                "prompt": "What is 2+2? Respond with digits only.",
                "reply": "4",
            }

    with TestClient(create_app()) as client:
        client.app.state.openrouter_client = StubOpenRouterClient()
        client.post("/api/login", json={"username": "user", "password": "password"})

        first_response = client.post(
            "/api/ai/connectivity-test",
            headers={"Origin": "http://testserver"},
        )
        second_response = client.post(
            "/api/ai/connectivity-test",
            headers={"Origin": "http://testserver"},
        )

    assert first_response.status_code == 200
    assert second_response.status_code == 429


def test_ai_chat_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/chat", json={"message": "Summarize the board."})

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_ai_chat_returns_message_without_mutating_board(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
            assert "Current board JSON:" in user_message
            assert "Latest user request:" in user_message
            return '{"assistantMessage":"Board is in good shape.","board":null}'

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "user", "password": "password"})

    before = client.get("/api/board").json()
    response = client.post(
        "/api/ai/chat",
        json={"message": "Summarize the board."},
        headers={"Origin": "http://testserver"},
    )
    after = client.get("/api/board").json()

    assert response.status_code == 200
    assert response.json() == {
        "assistantMessage": "Board is in good shape.",
        "boardUpdated": False,
        "board": before["board"],
        "boardVersion": before["boardVersion"],
        "schemaVersion": before["schemaVersion"],
    }
    assert after == before
    assert get_chat_history_for_username(client.app.state.db, "user") == [
        {"role": "user", "content": "Summarize the board."},
        {"role": "assistant", "content": "Board is in good shape."},
    ]


def test_ai_chat_applies_validated_board_update(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
            return (
                '{"assistantMessage":"Renamed the first column.","board":'
                '{"columns":[{"id":"col-backlog","title":"Ready","cardIds":["card-1","card-2"]},'
                '{"id":"col-discovery","title":"Discovery","cardIds":["card-3"]},'
                '{"id":"col-progress","title":"In Progress","cardIds":["card-4","card-5"]},'
                '{"id":"col-review","title":"Review","cardIds":["card-6"]},'
                '{"id":"col-done","title":"Done","cardIds":["card-7","card-8"]}],'
                '"cards":{"card-1":{"id":"card-1","title":"Align roadmap themes","details":"Draft quarterly themes with impact statements and metrics."},'
                '"card-2":{"id":"card-2","title":"Gather customer signals","details":"Review support tags, sales notes, and churn feedback."},'
                '"card-3":{"id":"card-3","title":"Prototype analytics view","details":"Sketch initial dashboard layout and key drill-downs."},'
                '"card-4":{"id":"card-4","title":"Refine status language","details":"Standardize column labels and tone across the board."},'
                '"card-5":{"id":"card-5","title":"Design card layout","details":"Add hierarchy and spacing for scanning dense lists."},'
                '"card-6":{"id":"card-6","title":"QA micro-interactions","details":"Verify hover, focus, and loading states."},'
                '"card-7":{"id":"card-7","title":"Ship marketing page","details":"Final copy approved and asset pack delivered."},'
                '"card-8":{"id":"card-8","title":"Close onboarding sprint","details":"Document release notes and share internally."}}}'
                '}'
            )

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "user", "password": "password"})

    response = client.post(
        "/api/ai/chat",
        json={"message": "Rename the first column to Ready."},
        headers={"Origin": "http://testserver"},
    )
    persisted = client.get("/api/board").json()

    assert response.status_code == 200
    assert response.json()["assistantMessage"] == "Renamed the first column."
    assert response.json()["boardUpdated"] is True
    assert response.json()["boardVersion"] == 2
    assert response.json()["board"]["columns"][0]["title"] == "Ready"
    assert persisted["boardVersion"] == 2
    assert persisted["board"]["columns"][0]["title"] == "Ready"

    history = get_chat_history_for_username(client.app.state.db, "user")
    assert history[-1]["boardMutation"]["columns"][0]["title"] == "Ready"


def test_ai_chat_rejects_invalid_model_output(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
            return '{"assistantMessage":"I changed it.","board":{"columns":[]}}'

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "user", "password": "password"})

    response = client.post(
        "/api/ai/chat",
        json={"message": "Do something unsafe."},
        headers={"Origin": "http://testserver"},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "AI response did not match the required schema."}


def test_chat_history_returns_persisted_messages(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
            return '{"assistantMessage":"Board is in good shape.","board":null}'

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "user", "password": "password"})
    client.post(
        "/api/ai/chat",
        json={"message": "Summarize the board."},
        headers={"Origin": "http://testserver"},
    )

    response = client.get("/api/chat-history")

    assert response.status_code == 200
    assert response.json() == {
        "messages": [
            {"role": "user", "content": "Summarize the board."},
            {"role": "assistant", "content": "Board is in good shape."},
        ]
    }


def test_board_route_returns_404_for_inconsistent_missing_board(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client.post("/api/login", json={"username": "user", "password": "password"})

    def fake_ensure_user_and_board(
        connection: sqlite3.Connection,
        username: str,
    ) -> dict[str, str]:
        del connection, username
        return {"id": "missing-user", "username": "user"}

    monkeypatch.setattr(db_module, "ensure_user_and_board", fake_ensure_user_and_board)

    response = client.get("/api/board")

    assert response.status_code == 404
    assert response.json() == {"detail": "Board not found for username 'user'."}


def test_create_app_rejects_default_password_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.delenv("PM_AUTH_PASSWORD", raising=False)
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)

    with pytest.raises(AppSettingsError, match="PM_AUTH_PASSWORD"):
        create_app()


def test_create_app_rejects_weak_session_secret_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_AUTH_PASSWORD", "StrongPassword123!")
    monkeypatch.setenv("PM_SESSION_SECRET", "too-short")

    with pytest.raises(AppSettingsError, match="PM_SESSION_SECRET"):
        create_app()


def test_login_sets_secure_cookie_outside_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_AUTH_PASSWORD", "StrongPassword123!")
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)

    with TestClient(create_app()) as client:
        response = client.post(
            "/api/login",
            json={"username": "user", "password": "StrongPassword123!"},
        )

    assert response.status_code == 200
    assert "Secure" in response.headers["set-cookie"]
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_production_does_not_load_dotenv_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_AUTH_PASSWORD", "StrongPassword123!")
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("PM_AUTH_USERNAME", "env-user")

    settings = create_app().state.settings

    assert settings.auth_username == "env-user"


def test_production_rejects_state_change_without_origin_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_AUTH_PASSWORD", "StrongPassword123!")
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)

    with TestClient(create_app()) as client:
        login_response = client.post(
            "/api/login",
            json={"username": "user", "password": "StrongPassword123!"},
        )
        client.cookies.set("pm_session", login_response.cookies.get("pm_session"))
        board = client.get("/api/board").json()["board"]
        response = client.put("/api/board", json={"board": board})

    assert response.status_code == 403
    assert response.json() == {"detail": "Origin or Referer header required."}


def test_production_accepts_same_origin_state_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_AUTH_PASSWORD", "StrongPassword123!")
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)

    with TestClient(create_app()) as client:
        login_response = client.post(
            "/api/login",
            json={"username": "user", "password": "StrongPassword123!"},
        )
        client.cookies.set("pm_session", login_response.cookies.get("pm_session"))
        board = client.get("/api/board").json()["board"]
        response = client.put(
            "/api/board",
            json={"board": board},
            headers={"Origin": "http://testserver"},
        )

    assert response.status_code == 200