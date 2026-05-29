from pydantic import BaseModel, Field


class LoginPayload(BaseModel):
    username: str
    password: str


class CardPayload(BaseModel):
    id: str
    title: str
    details: str


class ColumnPayload(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardPayload(BaseModel):
    columns: list[ColumnPayload]
    cards: dict[str, CardPayload]


class BoardEnvelope(BaseModel):
    board: BoardPayload


class AIChatPayload(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatMessagePayload(BaseModel):
    role: str
    content: str


class StructuredAssistantResponse(BaseModel):
    assistantMessage: str = Field(min_length=1)
    board: BoardPayload | None = None