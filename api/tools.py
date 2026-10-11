"""Tools the Gemini stylist can call. Gemini reads each function's type hints and docstring.

Tools that take owner_id (or the user's location) get it fixed by bind() before the agent sees
them, so the model can only ever look at the closet of the user it is styling.
"""

import functools
import inspect
import logging
import time
from typing import Literal

import httpx
from sqlmodel import Session, or_, select

import social
from db import Item, User, engine

log = logging.getLogger(__name__)


def search_closet(
    owner_id: int,
    category: str | None = None,
    color: str | None = None,
    min_formality: int | None = None,
    max_formality: int | None = None,
    silhouette: str | None = None,
    weather: str | None = None,
    include_shared: bool = False,
) -> list[dict]:
    """Search the user's closet. Call with no filters to see everything.

    Args:
        category: top, bottom, shoes, outerwear or accessory.
        color: a plain color name like black or olive; matches any of the item's colors.
        min_formality: lowest formality to include, 1 (gym/lounge) to 5 (black tie).
        max_formality: highest formality to include, 1 to 5.
        silhouette: slim, straight, relaxed, baggy, wide_leg, boxy, oversized or regular.
        weather: rain or snow; only items whose material handles it.
        include_shared: also return items the user's friends and groups share, which the user can
            borrow.

    Returns:
        One dict per item: id, category, subtype, colors, style, formality, warmth (1 very light
        to 5 heavy winter), weather_ok, silhouette, length, rise, visibility (full, partial or
        unknown: how much of the garment the photo showed) and fit_confirmed (the user checked
        the fit tags). With include_shared, every item also has owner_id and owner_name ("you" for
        the user's own items; anything else has to be borrowed from that person).
    """
    with Session(engine) as session:
        owners = {owner_id: "you"}
        if include_shared:
            lenders = social.lender_ids(session, owner_id)
            owners |= dict(session.exec(select(User.id, User.name).where(User.id.in_(lenders))).all())
        query = select(Item).where(Item.owner_id.in_(owners), or_(Item.owner_id == owner_id, Item.shared))
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
            **({"owner_id": i.owner_id, "owner_name": owners[i.owner_id]} if include_shared else {}),
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


# Used when the app couldn't get the phone's location (no permission, or not on HTTPS).
HOME = {"city": "New Brunswick, NJ", "latitude": 40.4862, "longitude": -74.4518}

# Open-Meteo is free and needs no API key. WMO weather codes -> plain words.
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
WMO_CODES = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "rain showers", 81: "rain showers", 82: "heavy rain showers", 85: "snow showers", 86: "snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail",
}
SNOW_CODES = {71, 73, 75, 77, 85, 86}
WET_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99} | SNOW_CODES

# Alternatives ask for the weather on every tap; a forecast barely changes in 15 minutes.
CACHE_SECONDS = 15 * 60
_cache: dict[tuple, tuple[float, dict]] = {}


def _locate(city: str) -> dict | None:
    """City name -> name, latitude, longitude. "Austin, TX" searches "Austin", the biggest match wins."""
    response = httpx.get(GEOCODE_URL, params={"name": city.split(",")[0].strip(), "count": 1}, timeout=5)
    response.raise_for_status()
    results = response.json().get("results")
    if not results:
        return None
    place = results[0]
    name = ", ".join(filter(None, [place["name"], place.get("admin1")]))
    return {"city": name, "latitude": place["latitude"], "longitude": place["longitude"]}


def _forecast(place: dict) -> dict:
    response = httpx.get(
        FORECAST_URL,
        params={
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "current": "temperature_2m,weather_code",
            "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
            "temperature_unit": "fahrenheit",
            "timezone": "auto",
            "forecast_days": 2,
        },
        timeout=5,
    )
    response.raise_for_status()
    return response.json()


def get_weather(
    here: dict | None = None, city: str | None = None, day: Literal["today", "tomorrow"] = "today"
) -> dict:
    """Live weather forecast. Call it when the user didn't say what the weather is like.

    Args:
        city: only if the user will be somewhere else; leave empty for where they are right now.
        day: today or tomorrow, whichever the outfit is for.

    Returns:
        city, day, temp_f (now for today, the day's high for tomorrow), high_f, low_f, conditions,
        rain_chance (percent), precipitation (true if rain or snow is likely) and snow. If the
        forecast can't be reached, only city and error.
    """
    # `here` is the phone's {latitude, longitude}, bound by stylist_tools; Gemini never sees it.
    try:
        if city:
            place = _locate(city)
        elif here:
            place = {"city": "the user's current location", **here}
        else:
            place = HOME
        if place is None:
            return {"city": city, "error": "Unknown city"}
        key = (round(place["latitude"], 2), round(place["longitude"], 2))  # ~1 km
        cached = _cache.get(key)
        if cached and time.time() - cached[0] < CACHE_SECONDS:
            data = cached[1]
        else:
            data = _forecast(place)
            _cache[key] = (time.time(), data)
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.warning("Weather lookup failed: %s", e)
        return {"city": city or HOME["city"], "error": "Weather is unavailable right now"}

    i = 0 if day == "today" else 1
    daily = data["daily"]
    code = daily["weather_code"][i]
    rain_chance = daily["precipitation_probability_max"][i] or 0
    high, low = round(daily["temperature_2m_max"][i]), round(daily["temperature_2m_min"][i])
    if day == "today":
        code = data["current"]["weather_code"]  # what it's doing right now
        temp = round(data["current"]["temperature_2m"])
    else:
        temp = high
    return {
        "city": place["city"],
        "day": day,
        "temp_f": temp,
        "high_f": high,
        "low_f": low,
        "conditions": WMO_CODES.get(code, "unknown"),
        "rain_chance": rain_chance,
        "precipitation": code in WET_CODES or rain_chance >= 50,
        "snow": code in SNOW_CODES or daily["weather_code"][i] in SNOW_CODES,
    }


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


def bind(fn, **fixed):
    """Return fn with these arguments fixed and removed from the signature Gemini sees."""

    @functools.wraps(fn)
    def bound(**kwargs):
        return fn(**fixed, **kwargs)

    sig = inspect.signature(fn)
    bound.__signature__ = sig.replace(parameters=[p for n, p in sig.parameters.items() if n not in fixed])
    bound.__annotations__ = {k: v for k, v in fn.__annotations__.items() if k not in fixed}
    del bound.__wrapped__  # otherwise inspect.signature follows it back to the original
    return bound


def stylist_tools(owner_id: int, here: dict | None = None) -> list:
    return [
        bind(search_closet, owner_id=owner_id),
        bind(get_weather, here=here),
        bind(get_preferences, owner_id=owner_id),
    ]
