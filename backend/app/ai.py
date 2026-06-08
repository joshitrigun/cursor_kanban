from __future__ import annotations

import json
import re
from typing import Any

from app.schemas import StructuredAssistantResponse


class AIResponseValidationError(ValueError):
    pass


MAX_PROMPT_CHARS = 12_000
MAX_HISTORY_MESSAGE_CHARS = 500
BOARD_COMPACTION_STEPS = (
    {"title_limit": None, "details_limit": None, "include_history": True},
    {"title_limit": None, "details_limit": None, "include_history": True},
    {"title_limit": 120, "details_limit": 240, "include_history": True},
    {"title_limit": 80, "details_limit": 120, "include_history": True},
    {"title_limit": 80, "details_limit": 0, "include_history": False},
)


STRUCTURED_SYSTEM_PROMPT = """You are a vacation planning assistant for a family trip Kanban board.
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
The board has an Ideas Inbox column with id col-unscheduled and one fixed day column per trip day.
Preserve all existing column ids and card references.
Use travel statuses when helpful: idea, researching, shortlisted, booked, confirmed, skipped.
Keep all card references valid.
When the user mentions a time for a card, set start_time in 24-hour HH:MM format.
Do not rely on putting times only in the title or details.
"""


TIME_PATTERN = re.compile(
    r"(?<!\d)(?P<hour>1[0-2]|0?[1-9])(?::(?P<minute>[0-5]\d))?\s*(?P<period>a\.?m\.?|p\.?m\.?)\b"
    r"|(?<!\d)(?P<hour24>[01]?\d|2[0-3]):(?P<minute24>[0-5]\d)(?!\d)",
    re.IGNORECASE,
)

CARD_ENRICHMENT_SYSTEM_PROMPT = """You are a travel planning assistant. Given a URL and any available metadata, return exactly one JSON object. No surrounding text.
{
  \"title\": string (short descriptive title, max 80 characters),
  \"summary\": string (1-2 sentences describing what this is for trip planning),
  \"tag\": \"Lodging\" | \"Food\" | \"Activity\" | \"Transport\" | \"Other\"
}"""


def build_card_enrichment_user_prompt(url: str, og_data: dict[str, str]) -> str:
    parts = [f"URL: {url}"]
    if og_data.get("title"):
        parts.append(f"Page title: {og_data['title']}")
    if og_data.get("description"):
        parts.append(f"Page description: {og_data['description']}")
    if og_data.get("site_name"):
        parts.append(f"Site: {og_data['site_name']}")
    return "\n".join(parts)


def parse_card_enrichment_response(raw: str) -> dict[str, str]:
    try:
        data = json.loads(raw.strip())
        return {
            "title": str(data.get("title", ""))[:80],
            "summary": str(data.get("summary", ""))[:300],
            "tag": str(data.get("tag", "Other")),
        }
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise AIResponseValidationError("Card enrichment response was not valid JSON.") from exc


def extract_time_from_text(text: str) -> str | None:
    match = TIME_PATTERN.search(text)
    if not match:
        return None

    if match.group("hour24") is not None:
        return f"{int(match.group('hour24')):02d}:{match.group('minute24')}"

    hour = int(match.group("hour"))
    minute = match.group("minute") or "00"
    period = match.group("period").lower()

    if period.startswith("p") and hour != 12:
        hour += 12
    if period.startswith("a") and hour == 12:
        hour = 0

    return f"{hour:02d}:{minute}"


def normalize_board_card_times(board: dict[str, Any]) -> dict[str, Any]:
    for card in board.get("cards", {}).values():
        if not isinstance(card, dict) or card.get("start_time"):
            continue
        text = f"{card.get('title', '')} {card.get('details', '')}"
        start_time = extract_time_from_text(text)
        if start_time:
            card["start_time"] = start_time
    return board


def build_structured_user_prompt(
    board: dict[str, Any],
    history: list[dict[str, Any]],
    user_message: str,
    trip: dict[str, Any] | None = None,
) -> str:
    trip_block = ""
    if trip:
        parts = []
        if trip.get("name"):
            parts.append(f"Trip: {trip['name']}")
        if trip.get("destination"):
            parts.append(f"Destination: {trip['destination']}")
        if trip.get("startDate"):
            parts.append(f"Start date: {trip['startDate']}")
        if trip.get("endDate"):
            parts.append(f"End date: {trip['endDate']}")
        trip_block = "\n".join(parts)
    for step in BOARD_COMPACTION_STEPS:
        board_json = json.dumps(
            compact_board_for_prompt(
                board,
                title_limit=step["title_limit"],
                details_limit=step["details_limit"],
            ),
            separators=(",", ":"),
        )
        history_block = build_history_block(
            history if step["include_history"] else [],
            user_message,
            board_json,
        )
        prompt = build_prompt(board_json, history_block, user_message, trip_block)
        if len(prompt) <= MAX_PROMPT_CHARS:
            return prompt

    minimal_board_json = json.dumps(
        compact_board_for_prompt(board, title_limit=40, details_limit=0),
        separators=(",", ":"),
    )
    return build_prompt(minimal_board_json, "(none)", truncate_text(user_message, 2000), trip_block)


def build_prompt(board_json: str, history_block: str, user_message: str, trip_block: str = "") -> str:
    trip_section = f"Trip context:\n{trip_block}\n\n" if trip_block else ""
    return (
        f"{trip_section}"
        "Current board JSON:\n"
        f"{board_json}\n\n"
        "Conversation history:\n"
        f"{history_block}\n\n"
        "Latest user request:\n"
        f"{user_message}"
    )


def truncate_text(value: str, max_chars: int | None) -> str:
    if max_chars is None or len(value) <= max_chars:
        return value
    if max_chars <= 0:
        return ""

    suffix = "...(truncated)"
    if max_chars <= len(suffix):
        return suffix[:max_chars]
    return f"{value[: max_chars - len(suffix)]}{suffix}"


def compact_board_for_prompt(
    board: dict[str, Any],
    *,
    title_limit: int | None,
    details_limit: int | None,
) -> dict[str, Any]:
    compact_cards: dict[str, dict[str, str]] = {}
    for card_id, card in board.get("cards", {}).items():
        compact_cards[card_id] = {
            "id": card["id"],
            "title": truncate_text(card["title"], title_limit),
            "details": truncate_text(card["details"], details_limit),
        }

    compact_columns = [
        {
            "id": column["id"],
            "title": truncate_text(column["title"], title_limit),
            "cardIds": column["cardIds"],
        }
        for column in board.get("columns", [])
    ]

    return {
        "columns": compact_columns,
        "cards": compact_cards,
    }


def build_history_block(
    history: list[dict[str, Any]],
    user_message: str,
    board_json: str,
) -> str:
    overhead = len(build_prompt(board_json, "", user_message))
    remaining_chars = MAX_PROMPT_CHARS - overhead
    if remaining_chars <= 0 or not history:
        return "(none)"

    normalized_lines = [format_history_line(item) for item in history]
    selected_lines: list[str] = []
    used_chars = 0
    omitted_messages = len(normalized_lines)

    for line in reversed(normalized_lines):
        line_cost = len(line) + (1 if selected_lines else 0)
        if used_chars + line_cost > remaining_chars:
            continue
        selected_lines.append(line)
        used_chars += line_cost
        omitted_messages -= 1

    if not selected_lines:
        return "(none)"

    selected_lines.reverse()
    if omitted_messages <= 0:
        return "\n".join(selected_lines)

    omitted_prefix = f"({omitted_messages} older messages omitted)"
    if len(omitted_prefix) + 1 + used_chars <= remaining_chars:
        return f"{omitted_prefix}\n" + "\n".join(selected_lines)

    return "\n".join(selected_lines)


def format_history_line(item: dict[str, Any]) -> str:
    line = f"{item['role']}: {truncate_text(item['content'], MAX_HISTORY_MESSAGE_CHARS)}"
    board_mutation = item.get("boardMutation")
    if board_mutation is None:
        return line

    mutation_json = json.dumps(
        compact_board_for_prompt(board_mutation, title_limit=60, details_limit=120),
        separators=(",", ":"),
    )
    mutation_suffix = f" [applied board update: {mutation_json}]"
    return truncate_text(line + mutation_suffix, MAX_HISTORY_MESSAGE_CHARS + 400)


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