FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app/frontend
ENV NEXT_PUBLIC_API_URL=
ENV PM_FORCE_STATIC_EXPORT=1

COPY frontend/package.json ./package.json
COPY frontend/package-lock.json ./package-lock.json
RUN npm ci

COPY frontend /app/frontend
RUN rm -rf out && npm run build


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
COPY --from=frontend-build /app/frontend/out /app/frontend/out

RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
