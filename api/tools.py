"""Tools the Gemini stylist can call. Gemini reads each function's type hints and docstring.

Every tool takes owner_id first; bind_owner() fixes it before the agent sees the tool, so the
model can only ever look at the closet of the user it is styling.
"""

import functools
import inspect

from sqlmodel import Session, select

from db import Item, User, engine


def search_closet(
    owner_id: int,
    category: str | None = None,
    color: str | None = None,
    min_formality: int | None = None,
    max_formality: int | None = None,
    silhouette: str | None = None,
    weather: str | None = None,
) -> list[dict]:
    """Search the user's closet. Call with no filters to see everything.

    Args:
        category: top, bottom, shoes, outerwear or accessory.
        color: a plain color name like black or olive; matches any of the item's colors.
        min_formality: lowest formality to include, 1 (gym/lounge) to 5 (black tie).
        max_formality: highest formality to include, 1 to 5.
        silhouette: slim, straight, relaxed, baggy, wide_leg, boxy, oversized or regular.
        weather: rain or snow; only items whose material handles it.

    Returns:
        One dict per item: id, category, subtype, colors, style, formality, warmth (1 very light
        to 5 heavy winter), weather_ok, silhouette, length, rise, visibility (full, partial or
        unknown: how much of the garment the photo showed) and fit_confirmed (the user checked
        the fit tags).
    """
    with Session(engine) as session:
        query = select(Item).where(Item.owner_id == owner_id)
        if category:
            query = query.where(Item.category == category.lower())
        if min_formality is not None:
            query = query.where(Item.formality >= min_formality)
        if max_formality is not None:
            query = query.where(Item.formality <= max_formality)
        if silhouette:
            query = query.where(Item.silhouette == silhouette.lower())
        items = session.exec(query.order_by(Item.id)).all()

    # colors and weather_ok are JSON lists, simpler to filter here than in SQL
    if color:
        items = [i for i in items if any(color.lower() in c for c in i.colors)]
    if weather:
        items = [i for i in items if weather.lower() in i.weather_ok]

    return [
        {
            "id": i.id,
            "category": i.category,
            "subtype": i.subtype,
            "colors": i.colors,
            "style": i.style,
            "formality": i.formality,
            "warmth": i.warmth,
            "weather_ok": i.weather_ok,
            "silhouette": i.silhouette,
            "length": i.length,
            "rise": i.rise,
            "visibility": i.visibility or "unknown",
            "fit_confirmed": i.fit_confirmed,
        }
        for i in items
    ]


def get_weather(city: str) -> dict:
    """Current weather for a city: temperature in Fahrenheit and conditions."""
    # TODO: real forecast API. Hardcoded so the stylist always has something to work with.
    return {"city": city, "temp_f": 58, "conditions": "light rain", "precipitation": True}


def get_preferences(owner_id: int) -> dict:
    """What the user tends to like or avoid, learned from items they swapped in and out of
    past outfits. May be empty.

    Returns:
        swaps: how many swaps this is based on.
        prefers / avoids: tag -> values, strongest first. Tags are "<category> silhouette",
        "<category> length", "style" and "colors".
    """
    with Session(engine) as session:
        user = session.get(User, owner_id)
        prefs = (user.preferences if user else None) or {}
    prefers, avoids = {}, {}
    for tag, values in prefs.get("scores", {}).items():
        ranked = sorted(values.items(), key=lambda kv: -abs(kv[1]))
        if liked := [v for v, s in ranked if s > 0]:
            prefers[tag] = liked
        if disliked := [v for v, s in ranked if s < 0]:
            avoids[tag] = disliked
    if not prefers and not avoids:
        return {}
    return {"swaps": prefs.get("swaps", 0), "prefers": prefers, "avoids": avoids}


def bind_owner(fn, owner_id: int):
    """Return fn with owner_id fixed and removed from the signature Gemini sees."""

    @functools.wraps(fn)
    def bound(**kwargs):
        return fn(owner_id, **kwargs)

    sig = inspect.signature(fn)
    bound.__signature__ = sig.replace(parameters=[p for n, p in sig.parameters.items() if n != "owner_id"])
    bound.__annotations__ = {k: v for k, v in fn.__annotations__.items() if k != "owner_id"}
    del bound.__wrapped__  # otherwise inspect.signature follows it back to the original
    return bound


def stylist_tools(owner_id: int) -> list:
    return [bind_owner(search_closet, owner_id), get_weather, bind_owner(get_preferences, owner_id)]
