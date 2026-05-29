from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class OpenRouterConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class OpenRouterSettings:
    api_key: str | None
    model: str = DEFAULT_OPENROUTER_MODEL
    base_url: str = DEFAULT_OPENROUTER_BASE_URL
    app_name: str = "Project Management MVP"


def load_openrouter_settings() -> OpenRouterSettings:
    return OpenRouterSettings(api_key=os.getenv("OPENROUTER_API_KEY"))


def extract_message_content(response_json: dict[str, Any]) -> str:
    content = response_json["choices"][0]["message"]["content"]
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        return "".join(parts).strip()
    raise ValueError("Unsupported OpenRouter response format.")


class OpenRouterClient:
    def __init__(
        self,
        settings: OpenRouterSettings,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self.transport = transport

    async def run_connectivity_test(self) -> dict[str, str]:
        reply = await self.chat(
            user_message="What is 2+2? Respond with digits only.",
            system_prompt="You are running a connectivity test. Reply with the correct digits only.",
        )
        return {
            "model": self.settings.model,
            "prompt": "What is 2+2? Respond with digits only.",
            "reply": reply,
        }

    async def chat(self, user_message: str, system_prompt: str | None = None) -> str:
        if not self.settings.api_key:
            raise OpenRouterConfigError("OPENROUTER_API_KEY is not configured.")

        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_message})

        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": self.settings.app_name,
        }
        payload = {
            "model": self.settings.model,
            "messages": messages,
        }

        async with httpx.AsyncClient(
            base_url=self.settings.base_url,
            headers=headers,
            timeout=30.0,
            transport=self.transport,
        ) as client:
            response = await client.post("/chat/completions", json=payload)
            response.raise_for_status()
            return extract_message_content(response.json())