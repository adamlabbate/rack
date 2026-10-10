from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, Column
from sqlmodel import Field, Session, SQLModel, create_engine, select

DB_PATH = Path(__file__).parent / "rack.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SEED_USERS = ["adam", "jake", "maya"]


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    avatar: str | None = None
    full_body_photo: str | None = None


class Item(SQLModel, table=True):
    __tablename__ = "items"

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id", index=True)
    image_path: str
    cutout_path: str | None = None
    onbody_path: str | None = None

    # What it is (filled in by Gemini tagging, editable by the user)
    category: str | None = None
    subtype: str | None = None
    colors: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    style: str | None = None
    formality: str | None = None
    season: str | None = None

    # How it fits
    silhouette: str | None = None
    length: str | None = None
    rise: str | None = None
    fit_confirmed: bool = False

    shared: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        existing = set(session.exec(select(User.name)).all())
        for name in SEED_USERS:
            if name not in existing:
                session.add(User(name=name))
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
