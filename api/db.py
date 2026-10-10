from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, Column, inspect, text
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
    formality: int | None = None  # 1-5
    season: str | None = None
    warmth: int | None = None  # 1 = very light, 5 = heavy winter
    weather_ok: list[str] = Field(default_factory=list, sa_column=Column(JSON))  # rain / snow
    custom_tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))  # user-only, never AI

    # How it fits
    silhouette: str | None = None
    length: str | None = None
    rise: str | None = None
    fit_confirmed: bool = False

    # Edits are tracked per field so re-tagging never overwrites what the user changed.
    user_edited: bool = False
    edited_fields: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    needs_retake: bool = False  # added from a photo where it overlapped another garment
    visibility: str | None = None  # full / partial: how much of it the photo showed

    shared: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Upload(SQLModel, table=True):
    """A photo with several garments, waiting for the user to pick which ones to add."""

    __tablename__ = "uploads"

    id: str = Field(primary_key=True)  # same hex id as the files in static/uploads
    owner_id: int = Field(foreign_key="users.id")
    image_path: str
    photo_type: str
    detections: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Outfit(SQLModel, table=True):
    """One outfit the stylist suggested. A single request saves 2-3 of these."""

    __tablename__ = "outfits"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    request: str
    name: str
    reason: str
    item_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    locked_item_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def add_missing_columns():
    """create_all() never alters existing tables, so add new nullable columns by hand."""
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name not in existing:
                    col_type = column.type.compile(engine.dialect)
                    # Give old rows the same defaults new rows get (false, [], ...), not NULL.
                    if isinstance(column.type, JSON):
                        default = " DEFAULT '[]'"
                    elif isinstance(getattr(column.default, "arg", None), (bool, int)):
                        default = f" DEFAULT {int(column.default.arg)}"
                    else:
                        default = ""
                    conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN "{column.name}" {col_type}{default}'))


def init_db():
    SQLModel.metadata.create_all(engine)
    add_missing_columns()
    with Session(engine) as session:
        existing = set(session.exec(select(User.name)).all())
        for name in SEED_USERS:
            if name not in existing:
                session.add(User(name=name))
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
