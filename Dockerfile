FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

RUN pip install --no-cache-dir uv

RUN groupadd --system appuser && useradd --system --gid appuser --create-home appuser

WORKDIR /app/backend

COPY backend/pyproject.toml ./pyproject.toml
RUN uv sync --no-dev

COPY backend /app/backend

RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
