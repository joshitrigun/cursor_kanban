from __future__ import annotations

import json
from typing import Any

from app.schemas import StructuredAssistantResponse


class AIResponseValidationError(ValueError):
    pass


STRUCTURED_SYSTEM_PROMPT = """You are a project management assistant for a single Kanban board.
Return exactly one JSON object and no surrounding commentary.
The JSON must match this shape:
{
  \"assistantMessage\": string,
  \"board\": {
    \"columns\": [{ \"id\": string, \"title\": string, \"cardIds\": string[] }],
    \"cards\": { [cardId: string]: { \"id\": string, \"title\": string, \"details\": string } }
  } | null
}
Only include a non-null board when you are confident a board update should be applied.
When no board update is needed, set board to null.
Preserve exactly five columns and keep all card references valid.
"""


def build_structured_user_prompt(
    board: dict[str, Any],
    history: list[dict[str, str]],
    user_message: str,
) -> str:
    history_lines = [f"{item['role']}: {item['content']}" for item in history]
    history_block = "\n".join(history_lines) if history_lines else "(none)"
    return (
        "Current board JSON:\n"
        f"{json.dumps(board, separators=(',', ':'))}\n\n"
        "Conversation history:\n"
        f"{history_block}\n\n"
        "Latest user request:\n"
        f"{user_message}"
    )


def parse_structured_assistant_response(raw_response: str) -> StructuredAssistantResponse:
    candidate = raw_response.strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if len(lines) >= 3 and lines[-1].strip() == "```":
            candidate = "\n".join(lines[1:-1]).strip()
            if candidate.lower().startswith("json\n"):
                candidate = candidate[5:].strip()

    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise AIResponseValidationError("AI response was not valid JSON.") from exc

    try:
        return StructuredAssistantResponse.model_validate(payload)
    except Exception as exc:
        raise AIResponseValidationError("AI response did not match the required schema.") from exc