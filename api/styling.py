"""Swaps on the stylist screen: rank alternatives for one piece, and learn preferences from swaps.

No Gemini here: alternatives have to show up instantly when a piece is tapped.
"""

from db import Item, User
from tools import get_weather

# Colors that go with anything. Gemini's colors are free text ("heather grey"), so match by word.
NEUTRALS = ("black", "white", "grey", "gray", "charcoal", "navy", "beige", "cream", "ivory",
            "tan", "khaki", "brown", "denim", "olive", "stone")

CITY = "New Brunswick"  # get_weather is still hardcoded; this only labels the result


def _main_color(item: Item) -> str | None:
    return item.colors[0].lower() if item.colors else None


def _is_neutral(color: str) -> bool:
    return any(n in color for n in NEUTRALS)


def _ideal_warmth(temp_f: int) -> int:
    return 4 if temp_f < 50 else 3 if temp_f < 65 else 2 if temp_f < 75 else 1


def score_alternative(candidate: Item, others: list[Item], target_formality: float, weather: dict):
    """0-1 score plus short notes for the UI: formality 40%, color 35%, weather 25%."""
    notes = []

    # Formality: how close to the rest of the outfit.
    diff = (candidate.formality or 3) - target_formality
    formality = 1 - min(abs(diff), 4) / 4
    notes.append("right formality" if abs(diff) <= 0.5 else "dressier" if diff > 0 else "more casual")

    # Color: neutrals always work; one accent color is fine; two different accents compete.
    color = _main_color(candidate)
    accents = {c for c in map(_main_color, others) if c and not _is_neutral(c)}
    if color is None:
        color_score = 0.5
    elif _is_neutral(color):
        color_score, note = 1.0, "neutral"
    elif not accents:
        color_score, note = 0.9, "adds color"
    elif any(color in a or a in color for a in accents):
        color_score, note = 0.8, "tonal"
    else:
        color_score, note = 0.3, "color clash"
    if color is not None:
        notes.append(note)

    # Weather: rain matters for shoes and outerwear only (same rule as the stylist); warmth for clothes.
    scores = []
    if weather.get("precipitation") and candidate.category in ("shoes", "outerwear"):
        rain_ok = "rain" in candidate.weather_ok
        scores.append(1.0 if rain_ok else 0.0)
        notes.append("rain-ok" if rain_ok else "not for rain")
    if candidate.category in ("top", "bottom", "outerwear") and candidate.warmth:
        scores.append(1 - abs(candidate.warmth - _ideal_warmth(weather["temp_f"])) / 4)
    weather_score = sum(scores) / len(scores) if scores else 1.0

    return round(0.4 * formality + 0.35 * color_score + 0.25 * weather_score, 2), notes


def rank_alternatives(item: Item, closet: list[Item], outfit_items: list[Item]) -> list[dict]:
    """Same-category items from the closet, best first, judged against the rest of the outfit."""
    others = [i for i in outfit_items if i.id != item.id]
    in_outfit = {i.id for i in outfit_items} | {item.id}
    formalities = [i.formality for i in others if i.formality] or [item.formality or 3]
    target = sum(formalities) / len(formalities)
    weather = get_weather(CITY)

    ranked = []
    for candidate in closet:
        if candidate.category != item.category or candidate.id in in_outfit:
            continue
        score, notes = score_alternative(candidate, others, target, weather)
        ranked.append({"item": candidate, "score": score, "notes": notes})
    return sorted(ranked, key=lambda r: -r["score"])


# Tags a swap teaches us something about. Fit is per category: baggy bottoms says nothing about tops.
FIT_TAGS = ("silhouette", "length")
SKIP_VALUES = {None, "unknown", "n_a", "regular"}


def record_swap(user: User, old: Item, new: Item):
    """+1 for what the user picked, -1 for what they swapped out, on every tag that differs."""
    prefs = dict(user.preferences or {})
    scores = {k: dict(v) for k, v in prefs.get("scores", {}).items()}

    def bump(key: str, value, delta: int):
        if value in SKIP_VALUES:
            return
        bucket = scores.setdefault(key, {})
        bucket[value] = bucket.get(value, 0) + delta
        if bucket[value] == 0:
            del bucket[value]

    for tag in FIT_TAGS:
        old_value, new_value = getattr(old, tag), getattr(new, tag)
        if old_value != new_value:
            bump(f"{new.category} {tag}", new_value, 1)
            bump(f"{new.category} {tag}", old_value, -1)
    if old.style != new.style:
        bump("style", new.style, 1)
        bump("style", old.style, -1)
    old_colors, new_colors = set(map(str.lower, old.colors)), set(map(str.lower, new.colors))
    for color in new_colors - old_colors:
        bump("colors", color, 1)
    for color in old_colors - new_colors:
        bump("colors", color, -1)

    prefs["scores"] = {k: v for k, v in scores.items() if v}
    prefs["swaps"] = prefs.get("swaps", 0) + 1
    user.preferences = prefs  # new dict so SQLAlchemy sees the JSON change
