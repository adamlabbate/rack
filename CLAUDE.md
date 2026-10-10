# CLAUDE.md

## Project
A shared-closet app (working name: Rack), built solo at HackRU (Gemini track).
People upload their clothes into a persistent digital wardrobe, a Gemini
stylist builds outfits from it, and later friends share closets and borrow
from each other. Fit matters: every item stores how it fits
(silhouette, length, rise), not just what it is.

## Hackathon context
- Track: Gemini. All AI features must use the Gemini API (google-genai);
  never swap in another model provider.
- Judged on functionality, creativity, and technical difficulty: a working
  end-to-end flow beats more half-finished features.
- Deadline: Devpost by 10:00 AM Sunday. Demo runs on a phone.
- Repo is public and judged: keep code readable, README current,
  no secrets committed.


## Roadmap (build in this order; only work on the CURRENT stage)
1. Wardrobe: upload clothing photos, remove background, Gemini tags
   category/color/style/formality/season + fit, user can edit tags.
   Everything persists (SQLite + images on disk), never per-session.
2. AI styling v1: user asks for an outfit in plain words; a Gemini agent
   picks items from the wardrobe and returns 2-3 outfits shown as
   flat-lay collages of the stored cutouts. Users can swap/lock items.
3. AI styling v2: render the outfit on the user's own full-body photo
   (Nano Banana), respecting each item's fit tags.
4. Social: friends, shared closets, the stylist can use friends' shared
   items, borrow requests (request / accept / decline).
5. Profiles: pin favorite pieces to your profile, post fit pics,
   fit history (a feed of past fits), public style profiles.
6. Later ideas (do NOT build unless asked): fit check mirror (phone
   camera logs what you're wearing), voice stylist (ElevenLabs).

CURRENT STAGE: 1 (Wardrobe)

## Stack
- api/: Python FastAPI, SQLModel + SQLite, rembg, google-genai
- web/: Next.js (App Router, TypeScript), Tailwind, shadcn/ui
- Images saved under api/static/ (uploads, cutouts, renders), served at /static
- Models: gemini-3.8-flash (tagging, stylist agent, checks),
  gemini-nano-banana-2.1 (on-body renders, stage 3)

## Data (grow tables as stages need them)
- users: id, name, avatar, full_body_photo
- items: id, owner_id, image_path, cutout_path, onbody_path, category,
  subtype, colors, style, formality, season, silhouette, length, rise,
  fit_confirmed, shared, created_at
- outfits (stage 2): id, user_id, request, item_ids, reason, locked_item_ids,
  render_path, created_at
- friendships, borrow_requests (stage 4)
- pins (stage 5): user_id, item_id, position
- posts (stage 5): id, user_id, photo_path, item_ids, caption, public, created_at

## Rules
- Phone-first UI: single column, bottom tab bar, big tap targets
- Never commit .env or API keys; read GEMINI_API_KEY from api/.env
- No real auth yet: a hardcoded user switcher (adam, jake, maya)
- Gemini output always uses structured output (Pydantic schemas, fixed enums)
- Validate AI outfits in code: 1 top, 1 bottom, 1 shoes, all IDs exist
- Keep it simple: no extra services, no premature abstraction
- Don't build features from later stages unless asked
- After each change, run it and test (curl or the browser) before saying it works

## Commands
- api: cd api && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0
- web: cd web && npm run dev -- -H 0.0.0.0

## Status / notes
- Stage 1 progress: upload + persistence + layout + user switcher done.
  Next: rembg cutouts -> Gemini tagging (gemini.py) -> tag edit UI.
- api/.env must contain GEMINI_API_KEY (not created yet).
- web/ is Next.js 16: read web/AGENTS.md and node_modules/next/dist/docs/
  before writing Next code.
- Node/Python come from Homebrew (/opt/homebrew/bin); venv is Python 3.12.
- Phone testing: http://<laptop LAN IP>:3000 (ipconfig getifaddr en0);
  use a phone hotspot if venue Wi-Fi isolates clients.