from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import httpx

from app.ai import AIResponseValidationError, STRUCTURED_SYSTEM_PROMPT, build_structured_user_prompt, parse_structured_assistant_response
from app.db import append_chat_exchange_for_username, default_db_path, get_board_for_username, get_chat_history_for_username, initialize_database, update_board_for_username
from app.openrouter import OpenRouterClient, OpenRouterConfigError, load_openrouter_settings
from app.schemas import AIChatPayload, BoardEnvelope, ChatMessagePayload, LoginPayload

frontend_out_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"
session_cookie_name = "pm_session"
valid_username = "user"
valid_password = "password"


@asynccontextmanager
async def lifespan(app: FastAPI):
  initialize_database(app.state.db_path)
  yield


def create_app(db_path: Path | None = None) -> FastAPI:
  app = FastAPI(title="Project Management MVP", lifespan=lifespan)
  app.state.db_path = Path(db_path) if db_path else default_db_path()
  app.state.openrouter_settings = load_openrouter_settings()
  app.state.openrouter_client = OpenRouterClient(app.state.openrouter_settings)

  @app.get("/api/health")
  def read_health() -> dict[str, str]:
      return {"status": "ok", "service": "backend"}


  @app.get("/api/session")
  def read_session(request: Request) -> dict[str, str | bool | None]:
    authenticated = is_authenticated(request)
    return {
      "authenticated": authenticated,
      "username": valid_username if authenticated else None,
    }


  @app.post("/api/login")
  def login(payload: LoginPayload, response: Response) -> dict[str, str | bool]:
    if payload.username != valid_username or payload.password != valid_password:
      response.status_code = status.HTTP_401_UNAUTHORIZED
      return {
        "authenticated": False,
        "message": "Invalid username or password.",
      }

    response.set_cookie(
      key=session_cookie_name,
      value=valid_username,
      httponly=True,
      samesite="lax",
      secure=False,
      path="/",
    )
    return {"authenticated": True, "username": valid_username}


  @app.post("/api/logout", status_code=status.HTTP_204_NO_CONTENT)
  def logout(response: Response) -> Response:
    response.delete_cookie(key=session_cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


  def require_authenticated_username(request: Request) -> str:
    if not is_authenticated(request):
      raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
      )
    return valid_username


  @app.get("/api/board")
  def read_board(request: Request) -> dict[str, object]:
    username = require_authenticated_username(request)
    return get_board_for_username(app.state.db_path, username)


  @app.put("/api/board")
  def update_board(request: Request, payload: BoardEnvelope) -> dict[str, object]:
    username = require_authenticated_username(request)
    return update_board_for_username(
      app.state.db_path,
      username,
      payload.board.model_dump(mode="json"),
    )


  @app.get("/api/chat-history")
  def read_chat_history(request: Request) -> dict[str, list[dict[str, str]]]:
    username = require_authenticated_username(request)
    messages = [
      ChatMessagePayload.model_validate(message).model_dump(mode="json")
      for message in get_chat_history_for_username(app.state.db_path, username)
    ]
    return {"messages": messages}


  @app.post("/api/ai/connectivity-test")
  async def run_ai_connectivity_test(request: Request) -> dict[str, str]:
    require_authenticated_username(request)

    try:
      return await app.state.openrouter_client.run_connectivity_test()
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


  @app.post("/api/ai/chat")
  async def run_ai_chat(request: Request, payload: AIChatPayload) -> dict[str, object]:
    username = require_authenticated_username(request)
    current_board = get_board_for_username(app.state.db_path, username)
    chat_history = get_chat_history_for_username(app.state.db_path, username)
    prompt = build_structured_user_prompt(
      current_board["board"],
      chat_history,
      payload.message,
    )

    try:
      raw_response = await app.state.openrouter_client.chat(
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
        app.state.db_path,
        username,
        board_mutation,
      )

    append_chat_exchange_for_username(
      app.state.db_path,
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


  if frontend_out_dir.exists():
      app.mount("/", StaticFiles(directory=frontend_out_dir, html=True), name="frontend")
  else:

      @app.get("/", response_class=HTMLResponse)
      def read_root() -> str:
          return """
          <!DOCTYPE html>
          <html lang=\"en\">
            <head>
              <meta charset=\"utf-8\" />
              <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
              <title>Project Management MVP</title>
              <style>
                body {
                  margin: 0;
                  font-family: Arial, sans-serif;
                  background: #f4f7fb;
                  color: #032147;
                }

                main {
                  max-width: 720px;
                  margin: 4rem auto;
                  padding: 2rem;
                  background: #ffffff;
                  border: 1px solid #d6e2ef;
                  border-radius: 20px;
                  box-shadow: 0 18px 50px rgba(3, 33, 71, 0.08);
                }

                h1 {
                  margin-top: 0;
                }

                code {
                  background: #eef4fb;
                  padding: 0.2rem 0.4rem;
                  border-radius: 6px;
                }
              </style>
            </head>
            <body>
              <main>
                <p>Scaffold ready</p>
                <h1>Project Management MVP</h1>
                <p>The FastAPI backend is running. The Kanban frontend will replace this placeholder in the next phase.</p>
                <p>Health check: <code>/api/health</code></p>
              </main>
            </body>
          </html>
          """

  return app


def is_authenticated(request: Request) -> bool:
  return request.cookies.get(session_cookie_name) == valid_username


app = create_app()