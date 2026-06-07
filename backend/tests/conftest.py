import os
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

# Must be set before app modules are imported so load_dotenv doesn't override
# them with production values from .env.
os.environ.setdefault("PM_ENV", "test")
# Set to empty so load_dotenv (called inside create_app) won't override with
# the real Postgres URL from .env — load_dotenv skips vars already in environ.
os.environ["DATABASE_URL"] = ""

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db import IN_MEMORY_DB_PATH
from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    app = create_app(IN_MEMORY_DB_PATH)
    with TestClient(app) as test_client:
        yield test_client