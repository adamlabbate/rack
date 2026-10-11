"""Seed the social demo: jake and maya are adam's friends, all three are in "Rutgers FACE", and
jake and maya get closets of dressier pieces adam can borrow (e.g. for a career fair).

Photos in seed_images/<user>/ go through the same pipeline as an upload: shrink, Gemini tagging,
background removal. With GEMINI_MOCK=1 the tags below are used instead of calling Gemini.
Safe to run again: photos that were already added are skipped.

    cd api && source .venv/bin/activate && python seed_social.py
"""

import os
from pathlib import Path

from PIL import Image
from sqlmodel import Session, select

import main
from db import Friendship, Group, GroupMember, Item, User, engine, init_db
from gemini import Garment, PhotoAnalysis, Tags

SEED_DIR = Path(__file__).parent / "seed_images"
FRIENDS_OF_ADAM = ["jake", "maya"]
GROUP = ("Rutgers FACE", "club", ["adam", "jake", "maya"])


def tags(category, subtype, colors, style, formality, warmth, silhouette, length, rise="n_a",
         season="all", weather_ok=()) -> Tags:
    return Tags(
        category=category, subtype=subtype, colors=colors, style=style, formality=formality, season=season,
        warmth=warmth, weather_ok=list(weather_ok), silhouette=silhouette, length=length, rise=rise,
    )


# Used only with GEMINI_MOCK=1, keyed by file name. Without mock, Gemini tags each photo.
MOCK_TAGS = {
    "jake": {
        "navy_blazer": tags("outerwear", "blazer", ["navy"], "formal", 4, 3, "slim", "regular"),
        "white_oxford_shirt": tags("top", "oxford shirt", ["white"], "smart_casual", 3, 2, "regular", "regular"),
        "light_blue_shirt": tags("top", "dress shirt", ["light blue"], "formal", 4, 2, "slim", "regular"),
        "navy_quarter_zip": tags("top", "quarter-zip sweater", ["navy"], "smart_casual", 3, 3, "regular",
                                 "regular", season="cold"),
        "grey_dress_trousers": tags("bottom", "dress trousers", ["charcoal"], "formal", 4, 2, "straight", "full",
                                    rise="mid"),
        "khaki_chinos": tags("bottom", "chinos", ["khaki"], "smart_casual", 3, 2, "slim", "full", rise="mid"),
        "brown_derby_shoes": tags("shoes", "derby shoes", ["brown"], "formal", 4, 2, "regular", "regular"),
        "black_chelsea_boots": tags("shoes", "chelsea boots", ["black"], "smart_casual", 3, 3, "regular",
                                    "regular", weather_ok=["rain"]),
        "camel_overcoat": tags("outerwear", "overcoat", ["camel"], "formal", 4, 5, "straight", "full",
                               season="cold"),
    },
    "maya": {
        "black_blazer": tags("outerwear", "blazer", ["black"], "formal", 4, 3, "regular", "regular"),
        "cream_silk_blouse": tags("top", "silk blouse", ["cream"], "smart_casual", 4, 1, "relaxed", "regular"),
        "white_knit_sweater": tags("top", "crewneck sweater", ["white"], "smart_casual", 3, 3, "regular",
                                   "regular", season="cold"),
        "black_wide_leg_trousers": tags("bottom", "wide-leg trousers", ["black"], "formal", 4, 2, "wide_leg",
                                        "full", rise="high"),
        "grey_pencil_skirt": tags("bottom", "pencil skirt", ["grey"], "formal", 4, 2, "slim", "regular",
                                  rise="high"),
        "black_loafers": tags("shoes", "loafers", ["black"], "formal", 4, 2, "regular", "regular"),
        "white_leather_sneakers": tags("shoes", "leather sneakers", ["white"], "casual", 2, 2, "regular",
                                       "regular"),
        "beige_trench_coat": tags("outerwear", "trench coat", ["beige"], "smart_casual", 4, 3, "relaxed",
                                  "full", weather_ok=["rain"]),
        "brown_leather_jacket": tags("outerwear", "leather jacket", ["brown"], "casual", 3, 3, "regular",
                                     "regular", weather_ok=["rain"]),
    },
}


def user_ids(session: Session) -> dict[str, int]:
    return {u.name: u.id for u in session.exec(select(User)).all()}


def seed_relationships(session: Session):
    ids = user_ids(session)
    for name in FRIENDS_OF_ADAM:
        for a, b in ((ids["adam"], ids[name]), (ids[name], ids["adam"])):
            if not session.get(Friendship, (a, b)):
                session.add(Friendship(user_id=a, friend_id=b))

    name, kind, members = GROUP
    group = session.exec(select(Group).where(Group.name == name)).first()
    if not group:
        group = Group(name=name, kind=kind)
        session.add(group)
        session.flush()  # assigns group.id
    for member in members:
        if not session.get(GroupMember, (group.id, ids[member])):
            session.add(GroupMember(group_id=group.id, user_id=ids[member]))
    session.commit()
    print(f"Friends: adam <-> {', '.join(FRIENDS_OF_ADAM)}. Group: {name} ({', '.join(members)})")


def mock_analysis(owner: str, stem: str) -> PhotoAnalysis | None:
    t = MOCK_TAGS.get(owner, {}).get(stem)
    if not t:
        return None  # added untagged, same as when Gemini is unreachable
    return PhotoAnalysis(
        photo_type="product",
        garments=[Garment(box_2d=[0, 0, 1000, 1000], visibility="full", overlapping=False, tags=t)],
    )


def add_photo(session: Session, owner: str, owner_id: int, path: Path) -> str:
    # A fixed upload id per photo, so a second run can tell it was already added.
    upload_id = f"seed_{owner}_{path.stem}"
    if session.exec(select(Item.id).where(Item.image_path.startswith(f"/static/uploads/{upload_id}"))).first():
        return "already added"

    upload_id, img, jpeg = main.save_photo(Image.open(path).convert("RGB"), upload_id)
    if os.getenv("GEMINI_MOCK") == "1":
        analysis = mock_analysis(owner, path.stem)
    else:
        analysis = main.gemini.analyze_photo(jpeg)
    result = main.process_photo(session, owner_id, upload_id, img, analysis)
    items = result.items
    if result.detections:  # Gemini saw several garments: keep only the biggest one
        biggest = max(result.detections, key=lambda d: (d.box[2] - d.box[0]) * (d.box[3] - d.box[1]))
        items = main.confirm_upload(upload_id, main.ConfirmUpload(indexes=[biggest.index]), session)
    return ", ".join(f"#{i.id} {i.category}/{i.subtype} f{i.formality}" for i in items)


def seed():
    init_db()
    main.load_rembg_sessions()
    mode = "mock tags" if os.getenv("GEMINI_MOCK") == "1" else "Gemini tagging"
    with Session(engine) as session:
        seed_relationships(session)
        ids = user_ids(session)
        for owner in FRIENDS_OF_ADAM:
            photos = sorted((SEED_DIR / owner).glob("*.jpg"))
            print(f"\n{owner}: {len(photos)} photos ({mode})")
            for path in photos:
                print(f"  {path.name}: {add_photo(session, owner, ids[owner], path)}", flush=True)


if __name__ == "__main__":
    seed()
