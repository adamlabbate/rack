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
- Everything persists in SQLite plus images on disk.

## Stack

| Part | Tech |
| --- | --- |
| API (`api/`) | Python 3.12, FastAPI, SQLModel + SQLite, rembg, google-genai |
| Web (`web/`) | Next.js 16 (App Router, TypeScript), Tailwind, shadcn/ui, Base UI |
| AI | Gemini `gemini-3.8-flash` (photo analysis and tagging) |

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

**3. On your phone**

Put your phone on the same Wi-Fi as your laptop, find the laptop's IP with
`ipconfig getifaddr en0` (macOS), and open `http://<that IP>:3000`. If the network blocks devices
from talking to each other (common at venues), connect the laptop to your phone's hotspot instead.

### Mock mode

Set `GEMINI_MOCK=1` (in your shell or in `api/.env`) to skip the Gemini API. Every photo then
returns the same two fake garments, which is handy for working on the UI without using quota.

## How an upload works

1. `POST /uploads` straightens and resizes the photo, then asks Gemini for the photo type and
   every garment's box, visibility, overlap and tags.
2. If there's a single garment that doesn't overlap anything, it's cut out and added right away.
   Otherwise the garments wait in an `uploads` row while you choose.
3. `POST /uploads/{id}/confirm` creates the items you kept and cuts each one out.
4. `PATCH /items/{id}` saves your edits. Changing a fit field marks the fit as confirmed.

## Roadmap

1. ~~Wardrobe~~: upload, cutouts, Gemini tags and fit, editing (done)
2. AI stylist: ask for an outfit in plain words, get 2–3 outfits from your closet
3. On-body renders: see an outfit on your own photo (Nano Banana)
4. Friends: shared closets and borrow requests
5. Profiles: pinned pieces, fit pics, fit history

Known issues are tracked in [TODO.md](TODO.md).

## License

[MIT](LICENSE)
