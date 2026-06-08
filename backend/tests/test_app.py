import json
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
    assert response.headers["server-timing"].startswith("app;dur=")
    assert float(response.headers["x-response-time-ms"]) >= 0
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_static_asset_is_served(client: TestClient) -> None:
    response = client.get("/favicon.ico")

    assert response.status_code == 200


def test_session_defaults_to_unauthenticated(client: TestClient) -> None:
    response = client.get("/api/session")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "username": None, "displayName": None}


def test_login_sets_authenticated_session_cookie(client: TestClient) -> None:
    response = client.post(
        "/api/login",
        json={"username": "dad", "password": "family2026"},
    )

    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "username": "dad"}
    assert response.cookies.get("pm_session") is not None
    assert response.cookies.get("pm_session") != "user"
    assert "Max-Age=28800" in response.headers["set-cookie"]

    session_response = client.get("/api/session")
    assert session_response.json() == {"authenticated": True, "username": "dad", "displayName": "Dad"}


def test_login_rate_limit_returns_429_after_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_LOGIN_RATE_LIMIT_ATTEMPTS", "2")
    monkeypatch.setenv("PM_LOGIN_RATE_LIMIT_WINDOW_SECONDS", "60")

    with TestClient(create_app()) as client:
        first_response = client.post(
            "/api/login",
            json={"username": "dad", "password": "wrong"},
        )
        second_response = client.post(
            "/api/login",
            json={"username": "dad", "password": "wrong"},
        )
        third_response = client.post(
            "/api/login",
            json={"username": "dad", "password": "wrong"},
        )

    assert first_response.status_code == 401
    assert second_response.status_code == 401
    assert third_response.status_code == 429
    assert int(third_response.headers["retry-after"]) in {59, 60}


def test_login_rotates_session_cookie(client: TestClient) -> None:
    first_response = client.post(
        "/api/login",
        json={"username": "dad", "password": "family2026"},
    )
    second_response = client.post(
        "/api/login",
        json={"username": "dad", "password": "family2026"},
    )

    assert first_response.cookies.get("pm_session") != second_response.cookies.get("pm_session")


def test_tampered_session_cookie_is_rejected(client: TestClient) -> None:
    client.cookies.set("pm_session", "user")

    session_response = client.get("/api/session")
    board_response = client.get("/api/board")

    assert session_response.json() == {"authenticated": False, "username": None, "displayName": None}
    assert board_response.status_code == 401


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/login",
        json={"username": "dad", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {
        "authenticated": False,
        "message": "Invalid username or password.",
    }


def test_logout_clears_session_cookie(client: TestClient) -> None:
    client.post(
        "/api/login",
        json={"username": "dad", "password": "family2026"},
    )

    response = client.post("/api/logout", headers={"Origin": "http://testserver"})

    assert response.status_code == 204
    session_response = client.get("/api/session")
    assert session_response.json() == {"authenticated": False, "username": None, "displayName": None}


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

    assert set(tables).issuperset({"users", "boards", "chat_messages", "trips"})


def test_board_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/board")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_chat_history_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/chat-history")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_authenticated_user_gets_seeded_board(client: TestClient) -> None:
    client.post("/api/login", json={"username": "dad", "password": "family2026"})

    response = client.get("/api/board")

    assert response.status_code == 200
    payload = response.json()
    assert payload["boardVersion"] == 1
    assert payload["schemaVersion"] == 1
    assert len(payload["board"]["columns"]) == 7
    assert payload["board"]["columns"][0]["id"] == "col-unscheduled"
    assert payload["board"]["cards"]["card-d1-1"]["title"] == "Depart home -- 9:00 AM"


def test_board_update_persists_and_increments_version(client: TestClient) -> None:
    client.post("/api/login", json={"username": "dad", "password": "family2026"})
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
        first_client.post("/api/login", json={"username": "dad", "password": "family2026"})
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
        second_client.post("/api/login", json={"username": "dad", "password": "family2026"})
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
    client.post("/api/login", json={"username": "dad", "password": "family2026"})

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
    client.post("/api/login", json={"username": "dad", "password": "family2026"})

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
        client.post("/api/login", json={"username": "dad", "password": "family2026"})

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
    client.post("/api/login", json={"username": "dad", "password": "family2026"})

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
    assert get_chat_history_for_username(client.app.state.db, "dad") == [
        {"role": "user", "content": "Summarize the board."},
        {"role": "assistant", "content": "Board is in good shape."},
    ]


def test_ai_chat_applies_validated_board_update(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
            return (
                '{"assistantMessage":"Renamed the first column.","board":'
                '{"columns":['
                '{"id":"col-ideas","title":"Ready","cardIds":["card-ideas-1","card-ideas-2"]},'
                '{"id":"col-research","title":"To Research","cardIds":["card-r-1","card-r-2","card-r-3"]},'
                '{"id":"col-booked","title":"Booked & Locked","cardIds":["card-d1-1","card-d1-2","card-d1-3","card-d1-4","card-d1-5","card-d2-1","card-d2-2","card-d2-3"]}'
                '],'
                '"cards":{'
                '"card-ideas-1":{"id":"card-ideas-1","title":"Whistler Village dinner spots","details":"Find a good restaurant."},'
                '"card-ideas-2":{"id":"card-ideas-2","title":"Souvenirs & local shops","details":"Check out local shops."},'
                '"card-r-1":{"id":"card-r-1","title":"Book Peak 2 Peak Gondola tickets","details":"Pre-book tickets."},'
                '"card-r-2":{"id":"card-r-2","title":"Reserve Ziplining session","details":"Ziptrek Ecotours."},'
                '"card-r-3":{"id":"card-r-3","title":"Whistler Village lunch options","details":"Find a patio restaurant."},'
                '"card-d1-1":{"id":"card-d1-1","title":"Depart home -- 9:00 AM","details":"Leave at 9 AM."},'
                '"card-d1-2":{"id":"card-d1-2","title":"Squamish coffee stop -- 10:30 AM","details":"Stop for coffee."},'
                '"card-d1-3":{"id":"card-d1-3","title":"Shannon Falls Provincial Park","details":"Short walk to waterfall."},'
                '"card-d1-4":{"id":"card-d1-4","title":"Drive to Whistler -- 45 min from Squamish","details":"Continue north."},'
                '"card-d1-5":{"id":"card-d1-5","title":"Whistler Village -- Lunch, check-in, farmers market","details":"Arrive Whistler."},'
                '"card-d2-1":{"id":"card-d2-1","title":"Peak 2 Peak Gondola -- Morning","details":"Morning ride."},'
                '"card-d2-2":{"id":"card-d2-2","title":"Ziplining in Whistler","details":"Afternoon ziplining."},'
                '"card-d2-3":{"id":"card-d2-3","title":"Capilano Suspension Bridge Park + drive home","details":"Head south."}'
                '}}}'
            )

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "dad", "password": "family2026"})

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

    history = get_chat_history_for_username(client.app.state.db, "dad")
    assert history[-1]["boardMutation"]["columns"][0]["title"] == "Ready"


def test_ai_chat_normalizes_time_from_created_card_text(client: TestClient) -> None:
    client.post("/api/login", json={"username": "dad", "password": "family2026"})
    board = client.get("/api/board").json()["board"]
    board["cards"]["card-ai-lunch"] = {
        "id": "card-ai-lunch",
        "title": "Lunch at Cactus Cafe - 1:00 PM",
        "details": "Family lunch in Vancouver.",
        "status": "idea",
        "ai_tag": "Food",
    }
    board["columns"][1]["cardIds"].append("card-ai-lunch")

    class StubOpenRouterClient:
        async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
            return json.dumps(
                {
                    "assistantMessage": "Added lunch.",
                    "board": board,
                }
            )

    client.app.state.openrouter_client = StubOpenRouterClient()

    response = client.post(
        "/api/ai/chat",
        json={"message": "Add Lunch at Cactus Cafe - 1:00 PM to Day 1."},
        headers={"Origin": "http://testserver"},
    )
    persisted = client.get("/api/board").json()

    assert response.status_code == 200
    assert response.json()["boardUpdated"] is True
    assert response.json()["board"]["cards"]["card-ai-lunch"]["start_time"] == "13:00"
    assert persisted["board"]["cards"]["card-ai-lunch"]["start_time"] == "13:00"


def test_ai_chat_rejects_invalid_model_output(client: TestClient) -> None:
    class StubOpenRouterClient:
        async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
            return '{"assistantMessage":"I changed it.","board":{"columns":[]}}'

    client.app.state.openrouter_client = StubOpenRouterClient()
    client.post("/api/login", json={"username": "dad", "password": "family2026"})

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
    client.post("/api/login", json={"username": "dad", "password": "family2026"})
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
    client.post("/api/login", json={"username": "dad", "password": "family2026"})

    def fake_get_board_row_for_username(
        connection: sqlite3.Connection,
        username: str,
    ) -> None:
        raise db_module.BoardNotFoundError("Shared family board not found.")

    monkeypatch.setattr(db_module, "get_board_row_for_username", fake_get_board_row_for_username)

    response = client.get("/api/board")

    assert response.status_code == 404
    assert response.json() == {"detail": "Shared family board not found."}


def test_create_app_rejects_weak_session_secret_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_SESSION_SECRET", "too-short")

    with pytest.raises(AppSettingsError, match="PM_SESSION_SECRET"):
        create_app()


def test_login_sets_secure_cookie_outside_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)

    with TestClient(create_app()) as client:
        response = client.post(
            "/api/login",
            json={"username": "dad", "password": "family2026"},
        )

    assert response.status_code == 200
    assert "Secure" in response.headers["set-cookie"]
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_production_does_not_load_dotenv_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("PM_AUTH_USERNAME", "env-user")

    settings = create_app().state.settings

    assert settings.auth_username == "env-user"


def test_production_rejects_state_change_without_origin_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PM_ENV", "production")
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)

    with TestClient(create_app()) as client:
        login_response = client.post(
            "/api/login",
            json={"username": "dad", "password": "family2026"},
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
    monkeypatch.setenv("PM_SESSION_SECRET", "s" * 32)

    with TestClient(create_app()) as client:
        login_response = client.post(
            "/api/login",
            json={"username": "dad", "password": "family2026"},
        )
        client.cookies.set("pm_session", login_response.cookies.get("pm_session"))
        board = client.get("/api/board").json()["board"]
        response = client.put(
            "/api/board",
            json={"board": board},
            headers={"Origin": "http://testserver"},
        )

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Phase 2 tests: new coverage for shared board, trip endpoints, security gap
# ---------------------------------------------------------------------------


def test_all_family_members_share_same_board(db_path: Path) -> None:
    """Any family member who logs in must see the same board (owned by dad)."""
    with TestClient(create_app(db_path)) as client:
        client.post("/api/login", json={"username": "dad", "password": "family2026"})
        dad_board = client.get("/api/board").json()["board"]

        client.post("/api/login", json={"username": "mom", "password": "family2026"})
        mom_board = client.get("/api/board").json()["board"]

    assert dad_board == mom_board


def test_family_member_board_change_visible_to_sibling(db_path: Path) -> None:
    """A change made by one family member must be immediately visible to another."""
    with TestClient(create_app(db_path)) as client:
        client.post("/api/login", json={"username": "dad", "password": "family2026"})
        board = client.get("/api/board").json()["board"]
        updated = {
            **board,
            "columns": [
                {**board["columns"][0], "title": "Our Ideas"},
                *board["columns"][1:],
            ],
        }
        client.put("/api/board", json={"board": updated}, headers={"Origin": "http://testserver"})

        client.post("/api/login", json={"username": "mom", "password": "family2026"})
        mom_board = client.get("/api/board").json()

    assert mom_board["board"]["columns"][0]["title"] == "Our Ideas"
    assert mom_board["boardVersion"] == 2


def test_session_returns_display_name(client: TestClient) -> None:
    client.post("/api/login", json={"username": "mom", "password": "family2026"})
    response = client.get("/api/session")

    assert response.status_code == 200
    assert response.json()["displayName"] == "Mom"
    assert response.json()["username"] == "mom"


def test_trip_get_returns_seeded_trip(client: TestClient) -> None:
    client.post("/api/login", json={"username": "dad", "password": "family2026"})
    response = client.get("/api/trip")

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Vancouver & Whistler Family Trip"
    assert data["destination"] == "Whistler & Vancouver, BC"
    assert data["startDate"] == "2026-06-28"
    assert data["endDate"] == "2026-07-03"


def test_trip_get_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/trip")
    assert response.status_code == 401


def test_trip_put_updates_and_persists(db_path: Path) -> None:
    with TestClient(create_app(db_path)) as client:
        client.post("/api/login", json={"username": "dad", "password": "family2026"})
        response = client.put(
            "/api/trip",
            json={
                "name": "Summer Trip 2026",
                "destination": "Banff, AB",
                "startDate": "2026-07-10",
                "endDate": "2026-07-14",
            },
            headers={"Origin": "http://testserver"},
        )
        assert response.status_code == 200
        assert response.json()["destination"] == "Banff, AB"

    with TestClient(create_app(db_path)) as client:
        client.post("/api/login", json={"username": "dad", "password": "family2026"})
        persisted = client.get("/api/trip").json()

    assert persisted["destination"] == "Banff, AB"
    assert persisted["startDate"] == "2026-07-10"


def test_trip_put_requires_authentication(client: TestClient) -> None:
    response = client.put("/api/trip", json={"name": "Test", "destination": "x"})
    assert response.status_code == 401


def test_cookie_for_nonexistent_user_is_rejected(client: TestClient) -> None:
    """A validly signed cookie containing a username that doesn't exist in the
    database must be rejected, not silently authenticated."""
    from itsdangerous import URLSafeTimedSerializer
    from app.api import SESSION_COOKIE_NAME

    serializer: URLSafeTimedSerializer = client.app.state.session_serializer
    ghost_cookie = serializer.dumps({"username": "ghost", "session_id": "abc123"})

    client.cookies.set(SESSION_COOKIE_NAME, ghost_cookie)

    session_response = client.get("/api/session")
    board_response = client.get("/api/board")

    assert session_response.json() == {"authenticated": False, "username": None, "displayName": None}
    assert board_response.status_code == 401


def test_quick_add_text_creates_card_in_unscheduled_column(client: TestClient) -> None:
    client.post("/api/login", json={"username": "trija", "password": "family2026"})
    response = client.post(
        "/api/cards/quick-add",
        json={"text": "Check out the Whistler Brewing Company"},
        headers={"Origin": "http://testserver"},
    )

    assert response.status_code == 200
    data = response.json()
    card_id = data["cardId"]
    board = data["board"]
    assert card_id in board["cards"]
    assert board["cards"][card_id]["title"] == "Check out the Whistler Brewing Company"
    assert board["cards"][card_id]["suggested_by"] == "Trija"
    assert board["cards"][card_id]["status"] == "idea"
    unscheduled_col = next(col for col in board["columns"] if col["id"] == "col-unscheduled")
    assert card_id in unscheduled_col["cardIds"]


def test_quick_add_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/cards/quick-add", json={"text": "some idea"})
    assert response.status_code == 401


def test_quick_add_rejects_empty_payload(client: TestClient) -> None:
    client.post("/api/login", json={"username": "dad", "password": "family2026"})
    response = client.post(
        "/api/cards/quick-add",
        json={"text": "   ", "url": ""},
        headers={"Origin": "http://testserver"},
    )
    assert response.status_code == 422
