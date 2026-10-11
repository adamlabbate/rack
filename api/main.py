import io
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
from pydantic import BaseModel, Field
from sqlmodel import Session, or_, select

import gemini
import social
import styling
from db import BorrowRequest, Group, GroupMember, Item, Outfit, Upload, User, get_session, init_db

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

# No CORS: the browser only talks to the Next.js app, which proxies /api/* and /static/* here
# (web/next.config.ts), so the API is same-origin from the browser's point of view.

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

    upload_id, img, jpeg = save_photo(img)
    return process_photo(session, owner_id, upload_id, img, gemini.analyze_photo(jpeg))


def save_photo(img: Image.Image, upload_id: str | None = None) -> tuple[str, Image.Image, bytes]:
    """Shrink and store a new photo. Returns its upload id, the shrunk image and its JPEG bytes."""
    upload_id = upload_id or uuid.uuid4().hex
    img = img.copy()
    img.thumbnail((MAX_EDGE, MAX_EDGE))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    (UPLOADS_DIR / f"{upload_id}.jpg").write_bytes(buf.getvalue())
    return upload_id, img, buf.getvalue()


def process_photo(
    session: Session, owner_id: int, upload_id: str, img: Image.Image, analysis: gemini.PhotoAnalysis | None
) -> UploadResult:
    """Crop and cut out the garments Gemini found. Also used by seed_social.py."""
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
    shared: bool | None = None  # show it to friends and groups (not a tag)


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
    if "shared" in changes:
        item.shared = bool(changes.pop("shared"))
    if not changes:
        session.add(item)
        session.commit()
        session.refresh(item)
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


class Location(BaseModel):
    """The phone's position, for the weather. The app leaves it out if it can't get one."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class StylistRequest(BaseModel):
    user_id: int
    request: str = Field(min_length=1)
    locked_item_ids: list[int] = []
    location: Location | None = None


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
        here = body.location.model_dump() if body.location else None
        picks = gemini.style_outfits(body.user_id, body.request.strip(), locked, here)
    except ValueError as e:  # closet or locked items make a valid outfit impossible
        raise HTTPException(422, str(e))
    if picks is None:
        raise HTTPException(502, "The stylist is unavailable, try again in a moment")
    if not picks:
        raise HTTPException(422, "Couldn't put together a complete outfit, try rephrasing")

    outfits = [
        Outfit(
            user_id=body.user_id, request=body.request.strip(), name=p.name, reason=p.reason,
            item_ids=p.item_ids, locked_item_ids=locked, borrowed_item_ids=p.borrowed_item_ids,
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


class Alternative(BaseModel):
    item: Item
    score: float  # 0-1: formality match 40%, color compatibility 35%, weather fit 25%
    notes: list[str]  # short reasons for the UI, e.g. "right formality", "rain-ok"


@app.get("/items/{item_id}/alternatives")
def item_alternatives(
    item_id: int,
    outfit_id: int | None = None,
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    session: Session = Depends(get_session),
) -> list[Alternative]:
    """Same-category items that could replace this one, best first.

    With outfit_id they come from the outfit owner's closet plus what friends share with them, judged
    against the rest of that outfit. Otherwise from the item owner's closet, judged against the item.
    """
    item = get_item_or_404(session, item_id)
    outfit_items = [item]
    closet = session.exec(select(Item).where(Item.owner_id == item.owner_id)).all()
    if outfit_id is not None:
        outfit = session.get(Outfit, outfit_id)
        if not outfit or item_id not in outfit.item_ids:
            raise HTTPException(404, "Item isn't in that outfit")
        outfit_items = [i for i in (session.get(Item, i) for i in outfit.item_ids) if i]
        closet = list(gemini.load_closet(outfit.user_id).values())
    here = {"latitude": lat, "longitude": lon} if lat is not None and lon is not None else None
    return styling.rank_alternatives(item, closet, outfit_items, here)


class Swap(BaseModel):
    old_item_id: int
    new_item_id: int


@app.post("/outfits/{outfit_id}/swap")
def swap_item(outfit_id: int, body: Swap, session: Session = Depends(get_session)) -> OutfitOut:
    """Replace one piece of a saved outfit and remember what the swap says about the user's taste."""
    outfit = session.get(Outfit, outfit_id)
    if not outfit:
        raise HTTPException(404, "Outfit not found")
    if body.old_item_id not in outfit.item_ids:
        raise HTTPException(400, "That item isn't in this outfit")
    if body.new_item_id in outfit.item_ids:
        raise HTTPException(400, "That item is already in this outfit")
    old = get_item_or_404(session, body.old_item_id)
    new = get_item_or_404(session, body.new_item_id)
    if new.id not in gemini.load_closet(outfit.user_id) or new.category != old.category:
        raise HTTPException(400, f"Pick another {old.category} from your closet or a friend's")

    # New lists so SQLAlchemy sees the JSON changes.
    outfit.item_ids = [new.id if i == old.id else i for i in outfit.item_ids]
    outfit.locked_item_ids = [i for i in outfit.locked_item_ids if i != old.id]
    outfit.borrowed_item_ids = [i for i in outfit.borrowed_item_ids if i != old.id]
    if new.owner_id != outfit.user_id:
        outfit.borrowed_item_ids.append(new.id)
    user = session.get(User, outfit.user_id)
    styling.record_swap(user, old, new)
    session.add_all([outfit, user])
    session.commit()
    session.refresh(outfit)
    return OutfitOut(outfit=outfit, items=[session.get(Item, i) for i in outfit.item_ids])


# ---------- Social (stage 4) ----------


def get_user_or_404(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "Unknown user")
    return user


@app.get("/users/{user_id}/friends")
def list_friends(user_id: int, session: Session = Depends(get_session)) -> list[User]:
    get_user_or_404(session, user_id)
    ids = social.friend_ids(session, user_id)
    return session.exec(select(User).where(User.id.in_(ids)).order_by(User.name)).all()


class GroupOut(BaseModel):
    group: Group
    members: list[User]


@app.get("/users/{user_id}/groups")
def list_groups(user_id: int, session: Session = Depends(get_session)) -> list[GroupOut]:
    get_user_or_404(session, user_id)
    groups = session.exec(
        select(Group).join(GroupMember).where(GroupMember.user_id == user_id).order_by(Group.name)
    ).all()
    return [
        GroupOut(
            group=g,
            members=session.exec(select(User).join(GroupMember).where(GroupMember.group_id == g.id)).all(),
        )
        for g in groups
    ]


class SharedItem(BaseModel):
    item: Item
    owner_name: str


@app.get("/closet/shared")
def shared_closet(user_id: int, session: Session = Depends(get_session)) -> list[SharedItem]:
    """Every shared item from the user's friends and groups."""
    get_user_or_404(session, user_id)
    return [SharedItem(item=item, owner_name=name) for item, name in social.shared_items(session, user_id)]


class BorrowCreate(BaseModel):
    item_id: int
    from_user: int  # the borrower; the item's owner is the recipient
    date_needed: date | None = None
    note: str | None = None


class BorrowOut(BaseModel):
    """A borrow request with its item and both names, ready for the app to show."""

    request: BorrowRequest
    item: Item
    from_name: str
    to_name: str


def borrow_out(session: Session, req: BorrowRequest) -> BorrowOut:
    return BorrowOut(
        request=req,
        item=session.get(Item, req.item_id),
        from_name=session.get(User, req.from_user).name,
        to_name=session.get(User, req.to_user).name,
    )


@app.post("/borrow")
def create_borrow(body: BorrowCreate, session: Session = Depends(get_session)) -> BorrowOut:
    get_user_or_404(session, body.from_user)
    item = get_item_or_404(session, body.item_id)
    if item.owner_id == body.from_user:
        raise HTTPException(400, "That's already your item")
    if not item.shared or item.owner_id not in social.lender_ids(session, body.from_user):
        raise HTTPException(403, "That item isn't shared with you")
    already = session.exec(
        select(BorrowRequest.id).where(
            BorrowRequest.item_id == item.id,
            BorrowRequest.from_user == body.from_user,
            BorrowRequest.status.in_(["pending", "accepted"]),
        )
    ).first()
    if already:
        raise HTTPException(409, "You already asked to borrow this")

    req = BorrowRequest(
        item_id=item.id, from_user=body.from_user, to_user=item.owner_id,
        date_needed=body.date_needed, note=(body.note or "").strip() or None,
    )
    session.add(req)
    session.commit()
    session.refresh(req)
    return borrow_out(session, req)


class BorrowLists(BaseModel):
    incoming: list[BorrowOut]  # others asking for this user's items
    outgoing: list[BorrowOut]  # this user asking for others' items


@app.get("/borrow")
def list_borrows(user_id: int, session: Session = Depends(get_session)) -> BorrowLists:
    get_user_or_404(session, user_id)

    def requests(column) -> list[BorrowOut]:
        rows = session.exec(
            select(BorrowRequest).where(column == user_id).order_by(BorrowRequest.created_at.desc())
        ).all()
        return [borrow_out(session, r) for r in rows]

    return BorrowLists(incoming=requests(BorrowRequest.to_user), outgoing=requests(BorrowRequest.from_user))


class BorrowUpdate(BaseModel):
    status: Literal["accepted", "declined", "returned"]
    user_id: int  # who is acting (no real auth yet)


# status -> (statuses it can come from, who may set it)
BORROW_TRANSITIONS = {
    "accepted": (("pending",), "owner"),
    "declined": (("pending",), "owner"),
    "returned": (("accepted",), "either"),
}


@app.patch("/borrow/{borrow_id}")
def update_borrow(borrow_id: int, body: BorrowUpdate, session: Session = Depends(get_session)) -> BorrowOut:
    """Owner accepts or declines a pending request; either side marks an accepted loan returned."""
    req = session.get(BorrowRequest, borrow_id)
    if not req:
        raise HTTPException(404, "Borrow request not found")
    allowed_from, who = BORROW_TRANSITIONS[body.status]
    if body.user_id != req.to_user and (who == "owner" or body.user_id != req.from_user):
        raise HTTPException(403, "Only the owner can do that" if who == "owner" else "Not your request")
    if req.status not in allowed_from:
        raise HTTPException(409, f"Can't mark a {req.status} request {body.status}")
    req.status = body.status
    session.add(req)
    session.commit()
    session.refresh(req)
    return borrow_out(session, req)
