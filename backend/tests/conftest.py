from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient


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