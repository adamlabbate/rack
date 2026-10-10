import logging
import os
import time
from typing import Literal

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

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


def analyze_photo(image_bytes: bytes, mime_type: str = "image/jpeg") -> PhotoAnalysis | None:
    """Detect and tag every garment in a photo in one call. None if Gemini can't be reached."""
    if os.getenv("GEMINI_MOCK") == "1":
        time.sleep(1)  # feel like a real call so loading states get exercised
        return MOCK_ANALYSIS

    for attempt in range(4):  # first try + 3 retries when Gemini is rate-limited or overloaded
        try:
            response = _get_client().models.generate_content(
                model=MODEL,
                contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), PROMPT],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PhotoAnalysis,
                ),
            )
            return response.parsed
        except errors.APIError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(2 ** (attempt + 1))  # 2s, 4s, 8s
                continue
            log.warning("Gemini analysis failed: %s", e)
            return None
        except Exception as e:  # bad key, network, unparseable output
            log.warning("Gemini analysis failed: %s", e)
            return None
    return None
