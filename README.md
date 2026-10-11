# Rack

**Your closet, styled by Gemini, shared with friends.**

Rack is a phone-first digital wardrobe. Snap a photo of your clothes and Rack cuts each piece
out, tags it with Gemini, and keeps it in your closet for good. Rack records **how each piece
fits** (silhouette, length, rise), not just what it is, so the stylist can build outfits that
actually work together.

Built solo at HackRU for the Gemini track.

## What works today

- **Upload any clothing photo**: a flat-lay, a hanger shot, a product photo, or an outfit you're
  wearing.
- **One Gemini call per photo** (`gemini-3.8-flash`, structured output) finds every garment,
  draws a box around each, and tags it:
  - category, type, colors, style, formality, season, warmth, and rain/snow suitability
  - fit: silhouette, length and rise. Gemini answers `unknown` instead of guessing when a piece
    is folded or hidden.
- **Multiple items in one photo**: Rack shows "Found N items" with a preview of each, so you
  pick which ones to add.
- **Overlap detection**: if garments overlap, Rack suggests laying them out separately. You can
  still add them, and they get a "retake" badge.
- **Clean cutouts** with rembg:
  - **Flat-lays, hangers and products:** `u2net` on a padded crop of each garment.
  - **Worn outfits:** `u2net_cloth_seg`, which separates upper-body, lower-body and full-body
    clothing, so you can add just the pants from a full-body photo.
- **Edit everything**: tap an item to fix any tag, add your own tags, or confirm its fit. Your
  edits are never overwritten by re-tagging.
- **Closet grid** with category filters, an amber dot on items whose fit isn't confirmed, and
  item deletion (image files are removed too).
- **AI stylist** (Style tab): ask for an outfit in plain words, or tap "Class tomorrow",
  "Date night" or "Career fair". A Gemini agent searches your closet with tools (closet search,
  weather, your learned preferences) and returns 2–3 outfits. Every outfit is checked in code
  (exactly one top, bottom and shoes, all from your closet) and retried once if it breaks a rule.
- **Flat-lay outfit cards**: swipe between outfits drawn from your cutouts, with each piece's fit
  under it and one line on why the outfit works.
- **Swap and lock**: tap a piece to see alternatives from your closet, ranked instantly by
  formality match, color compatibility and weather. Lock pieces you love and hit Regenerate to
  get new outfits built around them.
- **It learns from swaps**: every swap records what you picked over what you dropped
  (silhouette, length, style, colors), and the stylist reads those preferences next time.
- **Borrow from friends**: friends and groups (a dorm floor, a club, a friend group) share
  closets. The Friends tab lists them; tap one to browse what they share. The stylist can borrow
  a friend's piece when it fills a gap, like Jake's blazer for a career fair, and the outfit card
  marks it "Borrow from Jake". Tap that (or any shared piece) to send a request with a date and a
  note. The bell in the header shows requests for your clothes (accept / decline) and yours, and
  an accepted piece shows "Borrowed". Each item has a "Shared with friends" switch.
- Everything persists in SQLite plus images on disk.

## Stack

| Part | Tech |
| --- | --- |
| API (`api/`) | Python 3.12, FastAPI, SQLModel + SQLite, rembg, google-genai |
| Web (`web/`) | Next.js 16 (App Router, TypeScript), Tailwind, shadcn/ui, Base UI |
| AI | Gemini `gemini-3.8-flash` (photo analysis and tagging, stylist agent) |

## Running it locally

You need Python 3.12, Node.js, and a [Gemini API key](https://aistudio.google.com/apikey).

**1. API**

```bash
cd api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
echo "GEMINI_API_KEY=your-key-here" > .env
uvicorn main:app --reload --host 0.0.0.0
```

The first start downloads the background-removal models (a few hundred MB) into `~/.rembg`.
After that, startup takes a few seconds.

**2. Web app** (in a second terminal)

```bash
cd web
npm install
npm run dev -- -H 0.0.0.0
```

Open http://localhost:3000.

**Demo friends (optional).** `python seed_social.py` (in `api/`, venv active) makes jake and maya
adam's friends, puts all three in a "Rutgers FACE" group, and gives jake and maya 9 dressier
pieces each from `api/seed_images/` (product photos generated with Nano Banana), run through the
normal upload pipeline. It's safe to run twice. With `GEMINI_MOCK=1` it uses built-in tags
instead of calling Gemini.

**3. On your phone**

Put your phone on the same Wi-Fi as your laptop, find the laptop's IP with
`ipconfig getifaddr en0` (macOS), and open `http://<that IP>:3000`. If the network blocks devices
from talking to each other (common at venues), connect the laptop to your phone's hotspot instead.

### Mock mode

Set `GEMINI_MOCK=1` (in your shell or in `api/.env`) to skip the Gemini API. Every photo then
returns the same two fake garments, and the stylist returns two outfits built from your real
closet (top, bottom, shoes, plus a jacket if you have one), which is handy for working on the UI
without using quota.

## How an upload works

1. `POST /uploads` straightens and resizes the photo, then asks Gemini for the photo type and
   every garment's box, visibility, overlap and tags.
2. If there's a single garment that doesn't overlap anything, it's cut out and added right away.
   Otherwise the garments wait in an `uploads` row while you choose.
3. `POST /uploads/{id}/confirm` creates the items you kept and cuts each one out.
4. `PATCH /items/{id}` saves your edits. Changing a fit field marks the fit as confirmed.

## How the stylist works

1. `POST /stylist {user_id, request, locked_item_ids}` runs a Gemini agent with three tools:
   `search_closet`, `get_weather` and `get_preferences`. Weather is the live
   [Open-Meteo](https://open-meteo.com) forecast (free, no key) for today or tomorrow, at the
   phone's location when the browser shares it, otherwise New Brunswick, NJ.
2. A second structured-output call turns its answer into outfits. Code checks every outfit, sends
   the problems back to the agent once, and drops anything still invalid.
3. `GET /items/{id}/alternatives?outfit_id=` ranks same-category items without calling Gemini:
   40% formality match with the rest of the outfit, 35% color compatibility, 25% weather fit.
4. `POST /outfits/{id}/swap` saves the swap and updates your preferences.

## How sharing works

- Items are shared by default (`PATCH /items/{id} {"shared": false}` hides one). You can borrow
  any shared item owned by a friend or by someone in one of your groups.
- `GET /users/{id}/friends`, `GET /users/{id}/groups` and `GET /closet/shared?user_id=` (every
  item you can borrow, with its owner's name).
- The stylist's `search_closet` takes `include_shared=true` and then marks each item with its
  owner. The prompt says to prefer your own pieces and borrow only to fill a gap or clearly
  improve the outfit. Code works out which pieces are borrowed (`borrowed_item_ids`) instead of
  trusting the model.
- `POST /borrow`, `GET /borrow?user_id=` (incoming and outgoing), and `PATCH /borrow/{id}`: the
  owner accepts or declines a pending request, and either side marks an accepted loan returned.

## Roadmap

1. ~~Wardrobe~~: upload, cutouts, Gemini tags and fit, editing (done)
2. ~~AI stylist~~: outfits from your closet, flat-lay cards, swap, lock, regenerate (done)
3. Friends: shared closets, groups and borrow requests (built, polishing)
4. Profiles: pinned pieces, fit pics, fit history
5. Later: on-body renders, see an outfit on your own photo (Nano Banana)

Known issues are tracked in [TODO.md](TODO.md).

## License

[MIT](LICENSE)
