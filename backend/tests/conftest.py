"""Shared pytest fixtures for the NOVI backend tests.

Tests run against an isolated in-memory SQLite database. The production MySQL
engine created at import time is never used here; only the ORM metadata on the
two declarative bases (legacy ``app.core.database.Base`` and module-3
``app.m3.db.models.Base``) is reused.
"""

import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Keep tests hermetic: a dummy key lets the Gemini client construct without a
# real credential (it is never called), and Letta memory stays disabled.
os.environ.setdefault("GEMINI_API_KEY", "test-key-not-used")
os.environ.setdefault("LETTA_ENABLED", "false")

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import models  # noqa: E402,F401  (registers every legacy table)
from app.core.database import Base as LegacyBase  # noqa: E402
from app.m3.db import models as m3_models  # noqa: E402,F401  (registers m3 tables)
from app.m3.db.models import Base as M3Base  # noqa: E402
from app.models.user import User  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    LegacyBase.metadata.create_all(bind=engine)
    M3Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def user(db):
    student = User(
        email="student@test.local",
        password_hash="not-a-real-hash",
        first_name="Test",
        last_name="Student",
        grade=10,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student
