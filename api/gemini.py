import logging
import os
import time
from typing import Literal

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field
from sqlmodel import Session, select

import social
from db import Item, engine
from tools import stylist_tools

log = logging.getLogger(__name__)

MODEL = "gemini-3.8-flash"

# Fixed vocabularies, shared with the PATCH endpoint so user edits and AI tags agree.
Category = Literal["top", "bottom", "shoes", "outerwear", "accessory"]
Style = Literal["streetwear", "casual", "smart_casual", "formal", "athletic"]
Season = Literal["warm", "cold", "all"]
Weather = Literal["rain", "snow"]
Silhouette = Literal["slim", "straight", "relaxed", "baggy", "wide_leg", "boxy", "oversized", "regular", "unknown"]
Length = Literal["cropped", "regular", "full", "stacked", "unknown"]
PhotoType = Literal["flat_lay", "on_body", "hanger", "product"]
Rise = Literal["low", "mid", "high", "n_a"]


class Tags(BaseModel):
    category: Category
    subtype: str = Field(description="Specific garment type, lowercase, e.g. hoodie, cargos, dunks")
    colors: list[str] = Field(description="Main colors, most dominant first, plain names like black or olive")
    style: Style
    formality: int = Field(ge=1, le=5, description="1 = gym/lounge, 5 = black tie")
    season: Season
    warmth: int = Field(ge=1, le=5, description="1 = very light, 5 = heavy winter")
    weather_ok: list[Weather] = Field(
        description="Weather the material handles; empty if neither (suede or canvas shoes are not rain-ok)"
    )
    silhouette: Silhouette = Field(description="unknown if hidden, folded or cut off; never guess fit")
    length: Length = Field(description="unknown if hidden, folded or cut off; never guess fit")
    rise: Rise = Field(description="Waist rise for bottoms; n_a for anything that is not a bottom")


class Garment(BaseModel):
    box_2d: list[int] = Field(description="Bounding box [ymin, xmin, ymax, xmax], normalized 0-1000")
    visibility: Literal["full", "partial"]
    overlapping: bool = Field(description="True if another garment covers part of this one")
    tags: Tags


class PhotoAnalysis(BaseModel):
    photo_type: PhotoType
    garments: list[Garment]


PROMPT = """You are a menswear and streetwear stylist. Find every garment in this photo and tag each one.
- photo_type: flat_lay (laid on a surface), on_body (worn by a person), hanger, or product (studio/product shot).
- Include clothing, shoes and wearable accessories only. Ignore the person themselves and anything that is not clothing.
- A pair of shoes (or socks, gloves, earrings) is one garment with one box around both.
- box_2d tightly bounds the whole visible garment.
- Judge fit from each garment's shape and proportions, and weather suitability from its material.
- If a garment is partially hidden or folded so its length or silhouette can't be judged, return unknown for that field. Never guess fit."""

# GEMINI_MOCK=1 skips the API: two garments, the second partial and overlapping, to build the UI against.
MOCK_ANALYSIS = PhotoAnalysis(
    photo_type="flat_lay",
    garments=[
        Garment(
            box_2d=[60, 120, 520, 880],
            visibility="full",
            overlapping=False,
            tags=Tags(
                category="top", subtype="hoodie", colors=["grey"], style="streetwear", formality=1,
                season="cold", warmth=4, weather_ok=[], silhouette="boxy", length="regular", rise="n_a",
            ),
        ),
        Garment(
            box_2d=[440, 200, 980, 800],
            visibility="partial",
            overlapping=True,
            tags=Tags(
                category="bottom", subtype="cargos", colors=["olive"], style="streetwear", formality=1,
                season="all", warmth=3, weather_ok=[], silhouette="baggy", length="unknown", rise="mid",
            ),
        ),
    ],
)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    # Created lazily so load_dotenv() in main.py has run before GEMINI_API_KEY is read.
    global _client
    if _client is None:
        _client = genai.Client()
    return _client


def _with_retry(call):
    """Run a Gemini call, retrying up to 3 times when it's rate-limited or overloaded."""
    for attempt in range(4):
        try:
            return call()
        except errors.APIError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(2 ** (attempt + 1))  # 2s, 4s, 8s
                continue
            raise


def analyze_photo(image_bytes: bytes, mime_type: str = "image/jpeg") -> PhotoAnalysis | None:
    """Detect and tag every garment in a photo in one call. None if Gemini can't be reached."""
    if os.getenv("GEMINI_MOCK") == "1":
        time.sleep(1)  # feel like a real call so loading states get exercised
        return MOCK_ANALYSIS

    try:
        response = _with_retry(
            lambda: _get_client().models.generate_content(
                model=MODEL,
                contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), PROMPT],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PhotoAnalysis,
                ),
            )
        )
        return response.parsed
    except Exception as e:  # bad key, network, unparseable output, or still overloaded
        log.warning("Gemini analysis failed: %s", e)
        return None


# ---------- Stylist (stage 2) ----------


class OutfitPick(BaseModel):
    name: str = Field(description="Short outfit name, 2-4 words, e.g. Rainy day clean")
    item_ids: list[int] = Field(description="IDs of every item in the outfit, exactly as the stylist wrote them")
    borrowed_item_ids: list[int] = Field(
        description="The IDs in item_ids that belong to a friend (owner_name is not 'you'); empty if none"
    )
    reason: str = Field(description="One sentence on why this outfit works for the request")


class Outfits(BaseModel):
    outfits: list[OutfitPick] = Field(description="The 2-3 outfits the stylist proposed, in order")


STYLIST_PROMPT = """You are a personal stylist building outfits from the user's closet, plus pieces their friends
and groups share with them.

Use your tools:
- search_closet to see what the user owns. Only use item IDs that search_closet returned; never invent items.
- search_closet with include_shared=true to also see what friends can lend; each item has an owner_name
  ("you" for the user's own). Look at shared items whenever the user's own closet is thin for the occasion.
- get_weather if the user didn't describe the weather. If they did, trust what they said.
- get_preferences for what the user likes; it may be empty.

Rules for every outfit:
- Exactly one top, one bottom and one pair of shoes. Optionally one outerwear piece and a few accessories.
- Weather: in rain or snow, the shoes and any outerwear must list that weather in weather_ok. If nothing in
  the closet handles it, pick the closest option and say so. Match warmth to the temperature: under 50F
  needs warm layers (warmth 3-5 or a warm outerwear piece), over 75F light pieces (warmth 1-2).
- Keep formality consistent: pieces in one outfit should be within about 1 point of each other and suit
  the occasion.
- Respect fit: don't pair conflicting silhouettes (e.g. an oversized top with slim bottoms) unless it's an
  intentional, well-known look, and then say so in the reason.
- Prefer items with visibility full and fit_confirmed true; their tags are more reliable.
- Locked items must appear in every outfit.
- Prefer the user's own items. Borrow a friend's item only when it clearly improves the outfit or fills a
  gap (e.g. no blazer or dress shoes for a career fair), and name the friend in the reason
  ("borrow Jake's navy blazer").
- Make 2-3 outfits that are meaningfully different (reusing pieces is fine if the closet is small).

Answer with each outfit as: a short name (2-4 words), its item IDs, which of those IDs are borrowed, and one
sentence on why it works."""

REQUIRED_CATEGORIES = ("top", "bottom", "shoes")


def load_closet(owner_id: int) -> dict[int, Item]:
    """Everything the stylist may use: the user's own items plus what friends and groups share."""
    with Session(engine) as session:
        own = session.exec(select(Item).where(Item.owner_id == owner_id)).all()
        borrowable = [item for item, _ in social.shared_items(session, owner_id)]
        return {i.id: i for i in [*own, *borrowable]}


def check_request(closet: dict[int, Item], locked_item_ids: list[int]):
    """Raise ValueError if no valid outfit is possible, before spending any Gemini calls."""
    missing = [c for c in REQUIRED_CATEGORIES if not any(i.category == c for i in closet.values())]
    if missing:
        raise ValueError(f"Add at least one {', '.join(missing)} to your closet first")
    unavailable = [i for i in locked_item_ids if i not in closet]
    if unavailable:
        raise ValueError(f"Locked items {unavailable} aren't in your closet or shared with you")
    locked_categories = [closet[i].category for i in locked_item_ids]
    for category in REQUIRED_CATEGORIES:
        if locked_categories.count(category) > 1:
            raise ValueError(f"You can only lock one {category}")


def outfit_problems(item_ids: list[int], closet: dict[int, Item], locked_item_ids: list[int]) -> list[str]:
    """Everything wrong with one outfit; empty means it's valid."""
    problems = []
    if len(set(item_ids)) != len(item_ids):
        problems.append("uses the same item twice")
    unknown = [i for i in item_ids if i not in closet]
    if unknown:
        problems.append(f"uses item IDs {unknown}, which are not in the user's closet or shared with them")
    categories = [closet[i].category for i in item_ids if i in closet]
    for category in REQUIRED_CATEGORIES:
        if (count := categories.count(category)) != 1:
            problems.append(f"has {count} {category} items, needs exactly 1")
    missing = [i for i in locked_item_ids if i not in item_ids]
    if missing:
        problems.append(f"is missing locked items {missing}")
    return problems


def mock_outfits(owner_id: int, closet: dict[int, Item], locked_item_ids: list[int]) -> list[OutfitPick]:
    """GEMINI_MOCK=1: two outfits from the user's real items, rotating through each category.

    Own items come first in each category, so friends' items are only borrowed to fill gaps.
    Adds an outerwear piece when the closet has one, so locking a jacket can be tried in mock mode.
    """
    categories = REQUIRED_CATEGORIES + ("outerwear",)
    by_category = {
        c: [i.id for i in sorted(closet.values(), key=lambda i: (i.owner_id != owner_id, i.id)) if i.category == c]
        for c in categories
    }
    by_category = {c: ids for c, ids in by_category.items() if ids}
    locked = {closet[i].category: i for i in locked_item_ids}
    extras = [i for i in locked_item_ids if closet[i].category not in categories]
    return [
        OutfitPick(
            name=f"Mock fit {n + 1}",
            item_ids=[locked.get(c) or ids[n % len(ids)] for c, ids in by_category.items()] + extras,
            reason="Mock outfit (GEMINI_MOCK=1), no stylist call made.",
            borrowed_item_ids=[],
        )
        for n in range(2)
    ]


def _structure(answer: str) -> list[OutfitPick]:
    """Second call: turn the stylist's free-text answer into the Outfits schema."""
    response = _with_retry(
        lambda: _get_client().models.generate_content(
            model=MODEL,
            contents="Convert this stylist's answer into JSON. Copy names, item IDs and reasons exactly; "
            "don't add, remove or change any items.\n\n" + (answer or ""),
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=Outfits),
        )
    )
    return response.parsed.outfits if response.parsed else []


def _describe_problems(outfits: list[OutfitPick], problems: list[list[str]]) -> str:
    lines = [f'- "{o.name}" {"; ".join(p)}' for o, p in zip(outfits, problems) if p]
    if len(outfits) < 2:
        lines.append(f"- there are only {len(outfits)} outfits; give 2-3")
    return "Some outfits break the rules:\n" + "\n".join(lines) + "\nFix them and answer with the full set again."


def _log_tool_calls(chat):
    calls = [
        f"{part.function_call.name}({dict(part.function_call.args or {})})"
        for content in chat.get_history()
        for part in content.parts or []
        if part.function_call
    ]
    print("Stylist tool calls:", "; ".join(calls) or "none")


def mark_borrowed(outfits: list[OutfitPick], owner_id: int, closet: dict[int, Item]) -> list[OutfitPick]:
    """Set borrowed_item_ids from who owns each item, rather than trusting the model's list."""
    for o in outfits:
        o.borrowed_item_ids = [i for i in o.item_ids if closet[i].owner_id != owner_id]
    return outfits


def style_outfits(owner_id: int, request: str, locked_item_ids: list[int] = []) -> list[OutfitPick] | None:
    """Ask the stylist agent for 2-3 outfits and return only the ones that pass validation.

    Outfits may borrow items that friends and groups share; those IDs are in borrowed_item_ids.

    Raises ValueError if the closet or the locked items make a valid outfit impossible.
    Returns None if Gemini can't be reached.
    """
    closet = load_closet(owner_id)
    check_request(closet, locked_item_ids)

    if os.getenv("GEMINI_MOCK") == "1":
        time.sleep(1)
        outfits = mock_outfits(owner_id, closet, locked_item_ids)
        valid = [o for o in outfits if not outfit_problems(o.item_ids, closet, locked_item_ids)]
        return mark_borrowed(valid, owner_id, closet)

    message = f"Request: {request}"
    if locked_item_ids:
        message += f"\nLocked item IDs (put these in every outfit): {locked_item_ids}"

    try:
        # Agent call: the SDK runs search_closet / get_weather / get_preferences for the model.
        chat = _get_client().chats.create(
            model=MODEL,
            config=types.GenerateContentConfig(system_instruction=STYLIST_PROMPT, tools=stylist_tools(owner_id)),
        )
        outfits = _structure(_with_retry(lambda: chat.send_message(message)).text)
        problems = [outfit_problems(o.item_ids, closet, locked_item_ids) for o in outfits]
        if any(problems) or len(outfits) < 2:
            # One retry in the same chat, so the agent sees its own answer and what was wrong with it.
            log.warning("Stylist outfits invalid, retrying: %s", problems)
            feedback = _describe_problems(outfits, problems)
            outfits = _structure(_with_retry(lambda: chat.send_message(feedback)).text)
        _log_tool_calls(chat)
    except Exception as e:
        log.warning("Gemini stylist failed: %s", e)
        return None

    valid = [o for o in outfits if not outfit_problems(o.item_ids, closet, locked_item_ids)][:3]
    return mark_borrowed(valid, owner_id, closet)
