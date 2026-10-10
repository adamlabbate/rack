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

CURRENT STAGE: 2 (AI styling v1). Stage 1 is done; its loose ends are in TODO.md.

## Stack
- api/: Python FastAPI, SQLModel + SQLite, rembg (u2net, u2net_cloth_seg), google-genai
- web/: Next.js (App Router, TypeScript), Tailwind, shadcn/ui
- Images saved under api/static/ (uploads, cutouts, renders), served at /static
- Models: gemini-3.8-flash (photo analysis/tagging, stylist agent, checks),
  gemini-nano-banana-2.1 (on-body renders, stage 3)

## Data (grow tables as stages need them)
- users: id, name, avatar, full_body_photo
- items: id, owner_id, image_path (the item's own crop), cutout_path,
  onbody_path (original worn photo, shared by items cut from it), category,
  subtype, colors, style, formality (1-5), season, warmth (1-5), weather_ok,
  silhouette, length, rise, custom_tags, fit_confirmed, user_edited,
  edited_fields, needs_retake, shared, created_at
- uploads: id, owner_id, image_path, photo_type, detections (JSON), created_at.
  Pending multi-garment photos, deleted once confirmed or discarded.
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
- TODO.md is a backlog, not a task list: never work on its items unless the
  user asks for a specific one. You may append newly found issues to it.

## Commands
- api: cd api && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0
- web: cd web && npm run dev -- -H 0.0.0.0

## Status / notes
- Stage 1 is finished. Known issues and loose ends live in TODO.md: add new ones
  there; tick one off only after the user asked for it and it's fixed. The README is the public overview; keep its
  "What works today" and Roadmap in sync when a stage lands.
- api/.env holds GEMINI_API_KEY. GEMINI_MOCK=1 (env or api/.env) makes
  analyze_photo return a fixed 2-garment result with no API calls.
- Upload pipeline: POST /uploads -> gemini.analyze_photo (one call: photo_type +
  garments with box_2d/visibility/overlapping/tags) -> 1 clean garment is added
  directly, otherwise pending in the uploads table until POST /uploads/{id}/confirm
  (or DELETE /uploads/{id} on cancel/retake).
- Cutouts: u2net on the 5%-padded crop (flat_lay/hanger/product); on_body uses the
  u2net_cloth_seg mask for the category on the full photo, u2net as fallback.
  isnet-general-use was rejected: it erased white tees on light backgrounds.
- edited_fields protects user edits from POST /items/{id}/retag.
- Image files are deleted with what owns them via remove_unused_files(), which keeps
  any file still referenced (several items can share one onbody_path).
- Gemini 503s ("high demand") happen; analyze_photo retries 429 and 503.
- db.add_missing_columns() adds new columns to existing tables, but can't
  change a column's type: delete api/rack.db if a type changes.
- web/ is Next.js 16: read web/AGENTS.md and node_modules/next/dist/docs/
  before writing Next code.
- Node/Python come from Homebrew (/opt/homebrew/bin); venv is Python 3.12.
- Phone testing: http://<laptop LAN IP>:3000 (ipconfig getifaddr en0); the IP
  changes per network. Use a phone hotspot if venue Wi-Fi isolates clients
  (CORS allows 10.x, 172.16-31.x and 192.168.x).
