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
   (Nano Banana), respecting each item's fit tags. POSTPONED: skipped for now;
   come back only if stage 4 is done with time left, as one "See it on me" button.
4. Social: friends, shared closets, the stylist can use friends' shared
   items, borrow requests (request / accept / decline).
5. Profiles: pin favorite pieces to your profile, post fit pics,
   fit history (a feed of past fits), public style profiles.
6. Later ideas (do NOT build unless asked): fit check mirror (phone
   camera logs what you're wearing), voice stylist (ElevenLabs).

CURRENT STAGE: 3 ("See it on me"), built after stage 4. Stages 1, 2 and 4 are built (loose ends in TODO.md).

## Stack
- api/: Python FastAPI, SQLModel + SQLite, rembg (u2net, u2net_cloth_seg), google-genai
- web/: Next.js (App Router, TypeScript), Tailwind, shadcn/ui
- Images saved under api/static/ (uploads, cutouts, renders), served at /static
- Models: gemini-3.8-flash (photo analysis/tagging, stylist agent, checks),
  gemini-nano-banana-2.1 (on-body renders, stage 3)

## Data (grow tables as stages need them)
- users: id, name, avatar (profile picture, 512px square crop), full_body_photo, bio, location_city + latitude/longitude (typed city for the
  weather; null = phone location), preferences
- items: id, owner_id, image_path (the item's own crop), cutout_path,
  onbody_path (original worn photo, shared by items cut from it), category,
  subtype, colors, style, formality (1-5), season, warmth (1-5), weather_ok,
  silhouette, length, rise, custom_tags, fit_confirmed, user_edited,
  edited_fields, needs_retake, shared, created_at
- uploads: id, owner_id, image_path, photo_type, detections (JSON), created_at.
  Pending multi-garment photos, deleted once confirmed or discarded.
- outfits (stage 2): id, user_id, request, item_ids, reason, locked_item_ids,
  render_path, created_at
- friendships (user_id, friend_id; one row per direction), groups (id, name, kind: dorm/club/friends),
  group_members, borrow_requests (item_id, from_user = borrower, to_user = owner, status:
  pending/accepted/declined/returned, date_needed, note) (stage 4)
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
- Stage 2 backend and frontend are built (Style tab: web/src/app/style/page.tsx,
  components/outfit-card.tsx, components/alternatives-sheet.tsx). Stage 2 is done: tested end
  to end in mock mode and with the real stylist on a phone. Closets are still small; more photos
  are needed for richer outfits.
- Swaps: GET /items/{id}/alternatives?outfit_id= ranks same-category items in api/styling.py
  (no Gemini: formality 40%, color 35%, weather 25%). POST /outfits/{id}/swap updates the outfit
  and styling.record_swap() scores tags (+1 picked, -1 dropped) in users.preferences;
  tools.get_preferences() turns that into prefers/avoids for the agent.
- Every outfit response goes through main.outfit_out(): items that still exist, plus unavailable_item_ids
  (not in gemini.load_closet: deleted, unshared or lent out). The Style page re-fetches its outfits with
  GET /outfits?ids= on mount. POST /outfits/{id}/render refuses a new render (409) while a piece is unavailable.
- Locks live in the Style page state (one per top/bottom/shoes/outerwear); Regenerate sends
  only locked IDs still on screen.
- Stage 4 backend and frontend are built (Friends tab: app/friends/page.tsx and
  app/friends/[kind]/[id] -> components/shared-closet.tsx; borrow-context.tsx holds the current
  user's requests, polls every 10s and owns the request sheet; requests-sheet.tsx is the header
  bell). The root layout wraps BottomTabs in Suspense: usePathname() on a dynamic route needs it
  with cacheComponents. api/social.py: lender_ids() (friends + group-mates),
  shared_items() and lent_out() (items on an accepted loan to someone else; every closet pool skips them). Items are shared by default. The stylist's closet (gemini.load_closet) is own +
  borrowable items; search_closet(include_shared=True) adds owner_id/owner_name ("you" for own);
  mark_borrowed() sets borrowed_item_ids from ownership. Swap/alternatives with outfit_id use the
  same pool. PATCH /borrow/{id} takes {status, user_id}: owner accepts/declines pending, either
  side marks accepted -> returned.
- api/seed_social.py seeds friends, the "Rutgers FACE" group and 9 items each for jake and maya from
  api/seed_images/ (Nano Banana product shots) via main.save_photo/process_photo. Upload ids are
  seed_<user>_<file>, which is how reruns skip them. Mock mode uses its MOCK_TAGS.
- api/.env holds GEMINI_API_KEY. GEMINI_MOCK=1 (env or api/.env) makes
  analyze_photo return a fixed 2-garment result and style_outfits return 2 outfits
  from the user's real items (incl. an outerwear piece if they own one), with no API calls.
- Stylist: POST /stylist {user_id, request, locked_item_ids} -> gemini.style_outfits:
  agent chat with tools from api/tools.py (search_closet, get_weather (live Open-Meteo forecast,
  no key, cached 15 min; today/tomorrow; the phone's location via bind(), else tools.HOME =
  New Brunswick, NJ; returns {error} offline),
  get_preferences (learned from swaps)); bind_owner() hides owner_id from Gemini. A second
  structured call parses the answer into Outfits; outfit_problems() validates in
  code, one retry in the same chat with the errors, invalid ones dropped. Returns
  [{outfit, items}] (items expanded, with cutout_path) and saves outfits rows.
  422 = impossible request (closet lacks top/bottom/shoes, bad locks), 502 = Gemini
  down. Takes ~15-40s. Rain rule applies to shoes and outerwear only.
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
- Gemini 503s ("high demand") happen; all Gemini calls go through _with_retry (429/503).
- db.add_missing_columns() adds new columns to existing tables, but can't
  change a column's type: delete api/rack.db if a type changes.
- web/ is Next.js 16: read web/AGENTS.md and node_modules/next/dist/docs/
  before writing Next code.
- Node/Python come from Homebrew (/opt/homebrew/bin); venv is Python 3.12.
- One origin: the browser only talks to Next. web/next.config.ts rewrites /api/* -> localhost:8000/*
  and /static/* -> localhost:8000/static/*; frontend uses relative paths, the API has no CORS.
  experimental.proxyTimeout is 120s (default 30s cuts off the stylist).
- Stage 3 ("See it on me") is built: Profile tab (app/profile/page.tsx + components/body-photo-upload.tsx,
  also shown in the render sheet when there's no photo) -> POST /users/{id}/photo. The outfit card's
  "See it on me" opens components/render-sheet.tsx -> POST /outfits/{id}/render[?force=true] ->
  gemini.render_outfit (IMAGE_MODEL, prompt from render_prompt/describe_garment). Saved as
  static/renders/<outfit_id>.png in outfits.render_path; a swap or a new body photo clears it.
  Mock mode returns the photo with the cutouts pasted under it. One real render: ~12s, ~$0.04.
- Profile tab has two tabs (?tab=settings, read with useSearchParams inside Suspense): Fit photo (Replace /
  Remove: DELETE /users/{id}/photo, also clears renders) and Settings (components/profile-settings.tsx: profile picture via
  POST/DELETE /users/{id}/avatar, bio, location). components/avatar.tsx is the circle (initial if none); it's
  the Profile tab icon and sits by the name on the Settings tab.
- Shoes and accessories have no fit (db.NO_FIT_CATEGORIES): always fit_confirmed, no Fit box in the item sheet. PATCH /users/{id} {bio, city} geocodes the city with tools.locate(); city "" = phone location.
  main.weather_place(user, phone) picks saved city > phone coords > campus for the stylist, alternatives and
  GET /users/{id}/weather (the Style tab's components/weather-widget.tsx). With a saved city the web app never
  asks the phone for its location.
- Phone testing: `cloudflared tunnel --url http://localhost:3000` gives an HTTPS
  *.trycloudflare.com URL (works on any network, and HTTPS lets the phone share its location).
  Plain http://<laptop LAN IP>:3000 also works but gets campus weather (no geolocation on HTTP).
