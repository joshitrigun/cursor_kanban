import httpx
import pytest

from app.openrouter import OpenRouterClient, OpenRouterSettings


@pytest.mark.anyio
async def test_openrouter_client_builds_request_and_parses_reply() -> None:
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("Authorization")
        captured["http_referer"] = request.headers.get("HTTP-Referer")
        captured["x_title"] = request.headers.get("X-Title")
        captured["payload"] = await request.aread()
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "4",
                        }
                    }
                ]
            },
        )

    client = OpenRouterClient(
        OpenRouterSettings(api_key="test-key", model="openai/gpt-oss-120b"),
        transport=httpx.MockTransport(handler),
    )

    result = await client.run_connectivity_test()

    assert captured["method"] == "POST"
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["authorization"] == "Bearer test-key"
    assert captured["http_referer"] == "http://localhost:8000"
    assert captured["x_title"] == "Project Management MVP"
    assert b'"model":"openai/gpt-oss-120b"' in captured["payload"]
    assert result == {
        "model": "openai/gpt-oss-120b",
        "prompt": "What is 2+2? Respond with digits only.",
        "reply": "4",
    }


@pytest.mark.anyio
async def test_openrouter_client_uses_configured_referer() -> None:
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["http_referer"] = request.headers.get("HTTP-Referer")
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "Configured",
                        }
                    }
                ]
            },
        )

    client = OpenRouterClient(
        OpenRouterSettings(
            api_key="test-key",
            model="openai/gpt-oss-120b",
            http_referer="https://pm.example.test",
        ),
        transport=httpx.MockTransport(handler),
    )

    result = await client.chat(user_message="Hello")

    assert captured["http_referer"] == "https://pm.example.test"
    assert result == "Configured"