from pydantic import BaseModel, Field, model_validator


class LoginPayload(BaseModel):
    username: str
    password: str


class CardPayload(BaseModel):
    id: str
    title: str
    details: str
    status: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = None
    address: str | None = None
    content_url: str | None = None
    ai_title: str | None = None
    ai_summary: str | None = None
    ai_tag: str | None = None
    suggested_by: str | None = None
    trip_date: str | None = None
    deadline: str | None = None


class ColumnPayload(BaseModel):
    id: str
    title: str
    cardIds: list[str]
    locked: bool | None = None


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


class QuickAddPayload(BaseModel):
    text: str = Field(default="", max_length=4000)
    url: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def at_least_one_required(self) -> "QuickAddPayload":
        if not self.text.strip() and not self.url.strip():
            raise ValueError("At least one of text or url must be provided.")
        return self


class TripPayload(BaseModel):
    name: str = Field(default="", max_length=200)
    destination: str = Field(default="", max_length=200)
    startDate: str | None = None
    endDate: str | None = None
