import io
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
from pydantic import BaseModel, Field
from sqlmodel import Session, or_, select

import gemini
from db import Item, Outfit, Upload, User, get_session, init_db

load_dotenv(Path(__file__).parent / ".env")
register_heif_opener()  # lets Pillow read iPhone HEIC photos picked from the library

STATIC_DIR = Path(__file__).parent / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"
CUTOUTS_DIR = STATIC_DIR / "cutouts"
MAX_EDGE = 1600  # phone photos are huge; this keeps storage and background removal fast

# static/ is git-ignored, so make sure the folders exist on a fresh clone
for sub in ("uploads", "cutouts", "renders"):
    (STATIC_DIR / sub).mkdir(parents=True, exist_ok=True)


# rembg sessions, created once at startup (models download on the very first run).
# general: u2net background removal for flat-lays, hangers and product shots. (isnet-general-use
#   was tried first but made white/light garments on light backgrounds mostly transparent.)
# cloth: u2net_cloth_seg, which separates upper / lower / full-body clothing on a person.
SESSIONS = {}

PAD = 0.05  # crop padding around each garment's box, as a fraction of the box size

# Which u2net_cloth_seg mask to keep for a worn garment. Shoes and accessories have no mask.
CLOTH_SEG_PART = {"top": "upper", "outerwear": "upper", "bottom": "lower"}
FULL_BODY_PIECES = ("dress", "jumpsuit", "romper", "playsuit", "overalls", "boilersuit", "coverall")


def load_rembg_sessions():
    import rembg  # slow import (onnxruntime)

    SESSIONS["general"] = rembg.new_session("u2net")
    SESSIONS["cloth"] = rembg.new_session("u2net_cloth_seg")


def padded_box(box_2d: list[int], size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Gemini's [ymin, xmin, ymax, xmax] (0-1000) -> pixel (left, top, right, bottom) with padding."""
    w, h = size
    ymin, xmin, ymax, xmax = (max(0, min(1000, v)) for v in box_2d)
    if ymax <= ymin or xmax <= xmin:  # degenerate box: use the whole photo
        return 0, 0, w, h
    pad_y, pad_x = (ymax - ymin) * PAD, (xmax - xmin) * PAD
    return (
        int(max(0, xmin - pad_x) * w / 1000),
        int(max(0, ymin - pad_y) * h / 1000),
        int(min(1000, xmax + pad_x) * w / 1000),
        int(min(1000, ymax + pad_y) * h / 1000),
    )


def trim(cutout: Image.Image) -> Image.Image | None:
    """Crop a transparent image to its visible pixels; None if nothing is left."""
    bbox = cutout.getchannel("A").getbbox()
    return cutout.crop(bbox) if bbox else None


def cloth_seg_part(tags: gemini.Tags | None) -> str | None:
    if not tags:
        return None
    if any(piece in tags.subtype.lower() for piece in FULL_BODY_PIECES):
        return "full"
    return CLOTH_SEG_PART.get(tags.category)


def make_cutout(
    photo: Image.Image, box: tuple, photo_type: str, tags: gemini.Tags | None, masks: dict
) -> Image.Image | None:
    """Transparent cutout of one garment. `masks` caches cloth-seg masks across garments of one photo."""
    import rembg

    crop = photo.crop(box)
    try:
        part = cloth_seg_part(tags) if photo_type == "on_body" else None
        if part:
            # Segment the whole photo (the model needs to see the body), then cut out the box.
            if part not in masks:
                masks[part] = SESSIONS["cloth"].predict(photo, cloth_category=part)[0]
            mask = masks[part].crop(box)
            covered = mask.point(lambda v: 255 if v > 127 else 0).histogram()[255]
            if covered > 0.02 * crop.width * crop.height:  # otherwise treat the mask as empty
                cutout = crop.convert("RGBA")
                cutout.putalpha(mask)
                if result := trim(cutout):
                    return result
        return trim(rembg.remove(crop, session=SESSIONS["general"]))
    except Exception as e:
        print(f"Background removal failed: {e}")
        return None


TAG_FIELDS = list(gemini.Tags.model_fields)  # category, subtype, colors, ...
FIT_FIELDS = {"silhouette", "length", "rise"}


def apply_tags(item: Item, tags: gemini.Tags):
    """Copy AI tags onto an item, skipping anything the user has edited."""
    for field in TAG_FIELDS:
        if field not in item.edited_fields:
            setattr(item, field, getattr(tags, field))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    load_rembg_sessions()
    yield


app = FastAPI(title="Rack API", lifespan=lifespan)

# The web app runs on :3000, opened either on this machine or from a phone on the LAN.
# All three private IP ranges are allowed; iPhone hotspots use 172.20.10.x.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+"
        r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):3000"
    ),
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


class Detection(BaseModel):
    index: int
    preview_path: str  # padded crop of the original photo
    box: tuple[int, int, int, int]  # pixel (left, top, right, bottom) in the original
    visibility: str
    overlapping: bool
    tags: gemini.Tags | None


class UploadResult(BaseModel):
    """Either the items were added right away, or `detections` wait for the user to pick."""

    upload_id: str
    photo_type: str
    items: list[Item] = []
    detections: list[Detection] = []


def remove_unused_files(session: Session, paths: list[str | None]):
    """Delete image files that no item or pending upload points to any more.

    Several items can share one file (items cut from one worn photo all keep it as
    onbody_path), so a file only goes once its last reference is gone.
    """
    for path in set(filter(None, paths)):
        in_use = session.exec(
            select(Item.id).where(
                or_(Item.image_path == path, Item.cutout_path == path, Item.onbody_path == path)
            )
        ).first() or session.exec(select(Upload.id).where(Upload.image_path == path)).first()
        if not in_use:
            (STATIC_DIR / path.removeprefix("/static/")).unlink(missing_ok=True)


def upload_files(upload: Upload) -> list[str]:
    """The original photo plus every garment crop made from it."""
    return [upload.image_path] + [d["preview_path"] for d in upload.detections]


def create_items(session: Session, upload: Upload, detections: list[Detection]) -> list[Item]:
    photo = Image.open(STATIC_DIR / upload.image_path.removeprefix("/static/")).convert("RGB")
    masks: dict = {}
    items = []
    for det in detections:
        item = Item(
            owner_id=upload.owner_id,
            image_path=det.preview_path,
            # Worn photos are kept for on-body renders later (stage 3).
            onbody_path=upload.image_path if upload.photo_type == "on_body" else None,
            # TODO (stage 3): clean up overlapped garments with AI image editing instead of a retake.
            needs_retake=det.overlapping,
            visibility=det.visibility,
        )
        cutout = make_cutout(photo, det.box, upload.photo_type, det.tags, masks)
        if cutout:
            name = f"{upload.id}_{det.index}.png"
            cutout.save(CUTOUTS_DIR / name)
            item.cutout_path = f"/static/cutouts/{name}"
        if det.tags:
            apply_tags(item, det.tags)
        session.add(item)
        items.append(item)
    session.commit()
    for item in items:
        session.refresh(item)
    # Crops of garments the user skipped, and the original unless an item still uses it.
    remove_unused_files(session, upload_files(upload))
    return items


@app.post("/uploads")
def create_upload(
    file: UploadFile = File(...),
    owner_id: int = Form(...),
    session: Session = Depends(get_session),
) -> UploadResult:
    if not session.get(User, owner_id):
        raise HTTPException(404, "Unknown owner")

    try:
        img = Image.open(file.file)
        img = ImageOps.exif_transpose(img).convert("RGB")  # phones store rotation in EXIF
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "File is not a readable image")
    img.thumbnail((MAX_EDGE, MAX_EDGE))

    upload_id = uuid.uuid4().hex
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    (UPLOADS_DIR / f"{upload_id}.jpg").write_bytes(buf.getvalue())

    analysis = gemini.analyze_photo(buf.getvalue())
    if analysis is None:
        # Gemini unreachable: keep the whole photo as one untagged item rather than failing.
        photo_type = "flat_lay"
        detections = [
            Detection(
                index=0, preview_path=f"/static/uploads/{upload_id}.jpg", box=(0, 0, *img.size),
                visibility="full", overlapping=False, tags=None,
            )
        ]
    elif not analysis.garments:
        (UPLOADS_DIR / f"{upload_id}.jpg").unlink(missing_ok=True)
        raise HTTPException(422, "Couldn't find any clothing in this photo")
    else:
        photo_type = analysis.photo_type
        detections = []
        for i, garment in enumerate(analysis.garments):
            box = padded_box(garment.box_2d, img.size)
            img.crop(box).save(UPLOADS_DIR / f"{upload_id}_{i}.jpg", "JPEG", quality=90)
            detections.append(
                Detection(
                    index=i, preview_path=f"/static/uploads/{upload_id}_{i}.jpg", box=box,
                    visibility=garment.visibility, overlapping=garment.overlapping, tags=garment.tags,
                )
            )

    upload = Upload(
        id=upload_id,
        owner_id=owner_id,
        image_path=f"/static/uploads/{upload_id}.jpg",
        photo_type=photo_type,
        detections=[d.model_dump(mode="json") for d in detections],
    )
    # One clean garment: add it straight away. Several, or any overlap: let the user choose.
    if len(detections) == 1 and not detections[0].overlapping:
        return UploadResult(
            upload_id=upload_id, photo_type=photo_type, items=create_items(session, upload, detections)
        )
    session.add(upload)
    session.commit()
    return UploadResult(upload_id=upload_id, photo_type=photo_type, detections=detections)


class ConfirmUpload(BaseModel):
    indexes: list[int] = Field(min_length=1)


@app.post("/uploads/{upload_id}/confirm")
def confirm_upload(upload_id: str, body: ConfirmUpload, session: Session = Depends(get_session)) -> list[Item]:
    """Turn the garments the user kept into items. Overlapping ones are flagged needs_retake."""
    upload = session.get(Upload, upload_id)
    if not upload:
        raise HTTPException(404, "Upload not found or already added")
    detections = [Detection.model_validate(d) for d in upload.detections]
    chosen = [d for d in detections if d.index in set(body.indexes)]
    if len(chosen) != len(set(body.indexes)):
        raise HTTPException(400, "Unknown garment index")

    session.delete(upload)  # committed together with the new items
    return create_items(session, upload, chosen)


@app.delete("/uploads/{upload_id}")
def discard_upload(upload_id: str, session: Session = Depends(get_session)) -> dict:
    """The user cancelled the "Found N items" sheet or chose Retake: drop the photo and its crops."""
    upload = session.get(Upload, upload_id)
    if upload:
        session.delete(upload)
        session.commit()
        remove_unused_files(session, upload_files(upload))
    return {"deleted": upload_id}


@app.get("/items")
def list_items(owner_id: int, session: Session = Depends(get_session)) -> list[Item]:
    query = select(Item).where(Item.owner_id == owner_id).order_by(Item.created_at.desc())
    return session.exec(query).all()


class ItemUpdate(BaseModel):
    """Any subset of tag fields; values must match the same vocab Gemini uses."""

    category: gemini.Category | None = None
    subtype: str | None = None
    colors: list[str] | None = None
    style: gemini.Style | None = None
    formality: int | None = Field(None, ge=1, le=5)
    season: gemini.Season | None = None
    warmth: int | None = Field(None, ge=1, le=5)
    weather_ok: list[gemini.Weather] | None = None
    silhouette: gemini.Silhouette | None = None
    length: gemini.Length | None = None
    rise: gemini.Rise | None = None
    custom_tags: list[str] | None = None
    fit_confirmed: bool | None = None  # "fit looks right" without changing anything


def clean_list(values: list[str]) -> list[str]:
    """Trim, lowercase, drop blanks and duplicates, keep order."""
    return list(dict.fromkeys(v.strip().lower() for v in values if v.strip()))


def get_item_or_404(session: Session, item_id: int) -> Item:
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    return item


@app.patch("/items/{item_id}")
def update_item(item_id: int, update: ItemUpdate, session: Session = Depends(get_session)) -> Item:
    item = get_item_or_404(session, item_id)
    changes = update.model_dump(exclude_unset=True)
    if not changes:
        return item

    for field in ("colors", "custom_tags"):
        if field in changes:
            changes[field] = clean_list(changes[field] or [])
    if "subtype" in changes:
        changes["subtype"] = (changes["subtype"] or "").strip() or None

    edited = set(item.edited_fields)
    for field, value in changes.items():
        setattr(item, field, value)
        if field != "fit_confirmed":
            edited.add(field)

    # Touching fit, or confirming it, means the user owns those values from now on.
    if FIT_FIELDS & changes.keys() or changes.get("fit_confirmed"):
        item.fit_confirmed = True
        edited |= FIT_FIELDS
    item.user_edited = True
    item.edited_fields = sorted(edited)  # new list so SQLAlchemy sees the JSON change

    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/items/{item_id}")
def delete_item(item_id: int, session: Session = Depends(get_session)) -> dict:
    """Remove an item and any of its image files that nothing else uses."""
    item = get_item_or_404(session, item_id)
    files = [item.image_path, item.cutout_path, item.onbody_path]
    session.delete(item)
    session.commit()
    remove_unused_files(session, files)
    return {"deleted": item_id}


@app.post("/items/{item_id}/retag")
def retag_item(item_id: int, session: Session = Depends(get_session)) -> Item:
    """Ask Gemini again (e.g. if tagging failed on upload). User-edited fields are kept."""
    item = get_item_or_404(session, item_id)
    image_bytes = (STATIC_DIR / item.image_path.removeprefix("/static/")).read_bytes()
    analysis = gemini.analyze_photo(image_bytes)  # image_path is this item's own crop
    if not analysis or not analysis.garments:
        raise HTTPException(502, "Tagging failed, try again in a moment")

    def area(g: gemini.Garment) -> int:
        ymin, xmin, ymax, xmax = g.box_2d
        return (ymax - ymin) * (xmax - xmin)

    apply_tags(item, max(analysis.garments, key=area).tags)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


class StylistRequest(BaseModel):
    user_id: int
    request: str = Field(min_length=1)
    locked_item_ids: list[int] = []


class OutfitOut(BaseModel):
    """A saved outfit with its items expanded, so the app can draw the flat-lay right away."""

    outfit: Outfit
    items: list[Item]


@app.post("/stylist")
def stylist(body: StylistRequest, session: Session = Depends(get_session)) -> list[OutfitOut]:
    """Ask the Gemini stylist for 2-3 outfits from the user's closet; valid ones are saved."""
    if not session.get(User, body.user_id):
        raise HTTPException(404, "Unknown user")
    locked = list(dict.fromkeys(body.locked_item_ids))
    try:
        picks = gemini.style_outfits(body.user_id, body.request.strip(), locked)
    except ValueError as e:  # closet or locked items make a valid outfit impossible
        raise HTTPException(422, str(e))
    if picks is None:
        raise HTTPException(502, "The stylist is unavailable, try again in a moment")
    if not picks:
        raise HTTPException(422, "Couldn't put together a complete outfit, try rephrasing")

    outfits = [
        Outfit(
            user_id=body.user_id, request=body.request.strip(), name=p.name, reason=p.reason,
            item_ids=p.item_ids, locked_item_ids=locked,
        )
        for p in picks
    ]
    session.add_all(outfits)
    session.commit()
    result = []
    for outfit in outfits:
        session.refresh(outfit)
        items = [session.get(Item, i) for i in outfit.item_ids]  # validated: all exist
        result.append(OutfitOut(outfit=outfit, items=items))
    return result
