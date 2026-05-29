import pytest

from app.ai import AIResponseValidationError, build_structured_user_prompt, parse_structured_assistant_response


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