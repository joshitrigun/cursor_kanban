import json

import pytest

from app.ai import AIResponseValidationError, MAX_PROMPT_CHARS, build_structured_user_prompt, parse_structured_assistant_response


def test_build_structured_user_prompt_includes_board_history_and_message() -> None:
    prompt = build_structured_user_prompt(
        board={"columns": [], "cards": {}},
        history=[{"role": "user", "content": "hello"}],
        user_message="rename a column",
    )

    assert "Current board JSON:" in prompt
    assert "Conversation history:" in prompt
    assert "user: hello" in prompt
    assert "Latest user request:" in prompt
    assert "rename a column" in prompt


def test_parse_structured_assistant_response_accepts_json_code_fence() -> None:
    result = parse_structured_assistant_response(
        '```json\n{"assistantMessage":"Done.","board":null}\n```'
    )

    assert result.assistantMessage == "Done."
    assert result.board is None


def test_parse_structured_assistant_response_rejects_invalid_json() -> None:
    with pytest.raises(AIResponseValidationError, match="valid JSON"):
        parse_structured_assistant_response("not-json")


def test_build_structured_user_prompt_truncates_old_history_when_prompt_is_large() -> None:
    history = [
        {"role": "user", "content": f"message-{index}-" + ("x" * 900)}
        for index in range(40)
    ]

    prompt = build_structured_user_prompt(
        board={"columns": [], "cards": {}},
        history=history,
        user_message="keep the newest context",
    )

    assert len(prompt) <= MAX_PROMPT_CHARS
    assert "message-39-" in prompt
    assert "message-0-" not in prompt
    assert "older messages omitted" in prompt


def test_build_structured_user_prompt_compacts_board_json_when_card_details_are_large() -> None:
    board = {
        "columns": [
            {
                "id": "col-backlog",
                "title": "Backlog",
                "cardIds": ["card-1"],
            }
        ],
        "cards": {
            "card-1": {
                "id": "card-1",
                "title": "Very long card title" * 20,
                "details": "Very long card details " * 1000,
            }
        },
    }

    prompt = build_structured_user_prompt(
        board=board,
        history=[],
        user_message="summarize the board",
    )

    board_block = prompt.split("Current board JSON:\n", maxsplit=1)[1].split(
        "\n\nConversation history:",
        maxsplit=1,
    )[0]
    prompt_board = json.loads(board_block)

    assert len(prompt) <= MAX_PROMPT_CHARS
    assert prompt_board["cards"]["card-1"]["id"] == "card-1"
    assert len(prompt_board["cards"]["card-1"]["details"]) < len(board["cards"]["card-1"]["details"])


def test_build_structured_user_prompt_includes_applied_board_mutation_context() -> None:
    prompt = build_structured_user_prompt(
        board={"columns": [], "cards": {}},
        history=[
            {
                "role": "assistant",
                "content": "Renamed the first column.",
                "boardMutation": {
                    "columns": [
                        {"id": "col-backlog", "title": "Ready", "cardIds": []}
                    ],
                    "cards": {},
                },
            }
        ],
        user_message="what changed?",
    )

    assert "Renamed the first column." in prompt
    assert "applied board update" in prompt
    assert '"title":"Ready"' in prompt