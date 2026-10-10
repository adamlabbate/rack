import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
from sqlmodel import Session, select

from db import Item, User, get_session, init_db

load_dotenv(Path(__file__).parent / ".env")
register_heif_opener()  # lets Pillow read iPhone HEIC photos picked from the library

STATIC_DIR = Path(__file__).parent / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"
MAX_EDGE = 1600  # phone photos are huge; this keeps storage and background removal fast

# static/ is git-ignored, so make sure the folders exist on a fresh clone
for sub in ("uploads", "cutouts", "renders"):
    (STATIC_DIR / sub).mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Rack API", lifespan=lifespan)

# The web app runs on :3000, opened either on this machine or from a phone on the LAN.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):3000",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/users")
def list_users(session: Session = Depends(get_session)) -> list[User]:
    return session.exec(select(User).order_by(User.id)).all()


@app.post("/items")
def create_item(
    file: UploadFile = File(...),
    owner_id: int = Form(...),
    session: Session = Depends(get_session),
) -> Item:
    if not session.get(User, owner_id):
        raise HTTPException(404, "Unknown owner")

    try:
        img = Image.open(file.file)
        img = ImageOps.exif_transpose(img).convert("RGB")  # phones store rotation in EXIF
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "File is not a readable image")
    img.thumbnail((MAX_EDGE, MAX_EDGE))

    filename = f"{uuid.uuid4().hex}.jpg"
    img.save(UPLOADS_DIR / filename, "JPEG", quality=90)

    item = Item(owner_id=owner_id, image_path=f"/static/uploads/{filename}")
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.get("/items")
def list_items(owner_id: int, session: Session = Depends(get_session)) -> list[Item]:
    query = select(Item).where(Item.owner_id == owner_id).order_by(Item.created_at.desc())
    return session.exec(query).all()
