# TODO

Backlog for the user to prioritize. Don't start these without being asked.

Known issues and loose ends, to fix when there's time. Newest at the top of each section.

## Stage 4 (Social) follow-ups

- [x] **Jake's older items are not shared.** Items uploaded before stage 4 kept `shared = 0`;
      only new uploads default to shared. Flipped all 27 with `PATCH /items/{id} {"shared": true}`.
- [x] **Lent-out items still show as available.** `social.lent_out()` now hides an item on an
      accepted loan from its owner and other friends (shared closets, stylist, swaps, alternatives,
      new borrow requests get 409). The borrower still sees it. Back once it's marked returned.
- [ ] **Owner's Rack doesn't say an item is lent out.** It still shows in their closet grid with no
      "Lent to Adam" badge.
- [ ] **The career fair demo borrows everything.** Adam owns one casual tee, so all three real
      outfits were made only of Jake's or Maya's pieces. Adam needs more of his own clothes for
      "prefer own, borrow to fill gaps" to show.
- [ ] **Deleting an item with a borrow request breaks the bell.** `DELETE /items/{id}` leaves its
      borrow requests, and `borrow_out()` assumes the item exists, so `GET /borrow` would 500 for
      both people. Fix: delete (or skip) requests whose item is gone.
- [ ] **No auth on borrow actions.** `PATCH /borrow/{id}` trusts the `user_id` in the body.

## Stage 2 (AI styling) follow-ups

- [x] **Style results can go stale.** Fixed: the Style tab re-fetches its outfits (`GET /outfits?ids=`)
      when you come back. Edits show up; deleted pieces drop out; unshared or lent-out ones are
      greyed "Unavailable", and the card offers Restyle instead of See it on me. Render and swap no
      longer 500 on an outfit with a deleted piece.
- [ ] **Alternatives use today's forecast**, not the day or weather the user typed in their
      request (e.g. "tomorrow, it's going to pour").
- [ ] **Preferences never fade.** Swap scores only add up; an old swap counts as much as today's.
- [ ] **`users.preferences` starts as `[]` on migrated rows** (`add_missing_columns` gives every
      JSON column `DEFAULT '[]'`). Code reads it with `or {}`, so it's harmless.

- [ ] **Stylist is slow (~40s).** One real `POST /stylist` took 40s (agent call with tools + a
      structuring call). Needs a good loading state in the UI; could also try lower thinking
      budget or skipping the second call.
- [x] **`get_weather` is hardcoded** (58°F, light rain) in `api/tools.py`. Now a live Open-Meteo
      forecast at the phone's location.
- [x] **No location on the phone over plain HTTP.** Fixed by serving everything from one origin
      and opening it through a cloudflared tunnel (HTTPS). Plain LAN HTTP still gets campus weather.
- [ ] **One stylist call took 70s** through the tunnel (usually 15-40s), probably a Gemini retry.
      The proxy allows 120s; anything slower fails.
- [ ] **Only one outerwear piece per outfit.** On a cold rainy day the stylist can't layer the
      warm hooded jacket under the rain shell; it puts a warm top under the shell instead.
- [x] **Reasons can invent details.** One outfit called a hoodie "fleece" though no tag says so.
      Fixed in `STYLIST_PROMPT`: 1-2 specific sentences (colors, types, notable fit, real weather
      numbers, who to borrow from), nothing the tags don't say, no "regular", no internal fields.
      Checked on 12 real outfits.
- [x] **Parallel stylist calls failed right after a server start** ("client has been closed"):
      two first requests each created a Gemini client and the loser was garbage-collected
      mid-call. Fixed with a lock in `gemini._get_client()`.
- [ ] **Outfits repeat when options are thin.** With one rain-ok pair of shoes and one rain
      jacket, all 3 outfits share them. Expected, but worth a "add rain shoes" hint in the UI.

## Stage 1 (Wardrobe) follow-ups

- [ ] **Cutouts sometimes cut off parts of the garment.** Seen on jake's flat-lay / hanger /
      product photos, so it's the u2net path (padded crop -> `rembg.remove`), not cloth-seg.
      Likely causes: Gemini's `box_2d` is tighter than the garment and the 5% `PAD` doesn't
      cover it, or u2net drops low-contrast parts (sleeves, straps, laces). Things to try:
      bigger padding, running u2net on the whole photo and then cropping, or rembg's
      `alpha_matting` option.
- [x] **Odd `weather_ok` tags on accessories.** Fixed: `apply_tags` clears it for anything but
      shoes and outerwear (unless the user set it), and the prompt says so. Items tagged before the
      fix keep their old value until re-tagged.
      Was: Gemini tagged a belt rain/snow-ok, so the
      stylist adds it as a "weather" piece. Could limit `weather_ok` to shoes and outerwear
      in the prompt, or ignore it for accessories.
- [ ] **Shoe pairs may show up as two items.** On a full-body photo Gemini listed the left and
      right sneaker separately. The prompt now says "a pair of shoes is one garment"
      (`api/gemini.py`), but that hasn't been checked against a real photo yet.
- [x] **Overlap notice always shows for worn photos.** Fixed: overlap is ignored for `on_body`
      photos in `process_photo` (no notice, no retake badge). Was: On `on_body` photos Gemini marks pants as
      overlapping because the shirt covers the waistband, so "These items overlap" appears every
      time. Possible fix: skip the overlap check when `photo_type == "on_body"`.
- [ ] **Fit is marked confirmed too early.** If Gemini returned `unknown` silhouette and length
      and the user sets only the silhouette, `fit_confirmed` becomes true (as specced) and the
      amber dot disappears while length is still `unknown`.
- [ ] **"Retake" is only a label.** Items flagged `needs_retake` show a badge, but there's no
      way to replace an item's photo; you have to delete the item and upload again.
- [x] **Abandoned uploads leak.** Closing the app while the "Found N items" sheet is open leaves
      the photo, its crops and the pending `uploads` row behind. Fixed: on startup,
      `discard_stale_uploads()` drops pending uploads older than a day and their files.
- [ ] **`unknown` is a selectable chip.** Users can pick "unknown" for silhouette and length
      themselves. Harmless, but slightly odd.

## Repo / housekeeping

- [ ] `web/README.md` is still the create-next-app boilerplate. Delete it or point it to the
      root README.
- [ ] Old test images from before file cleanup existed are still in `api/static/uploads/` and
      `api/static/cutouts/` (git-ignored, so only local clutter).

## Stage 3 (See it on me) follow-ups

- [x] **Real render of a real outfit on the user's own photo.** Outfit #64 (5 pieces) on the
      user's seated photo took 13.1s. Pose, face and every piece came through; the background was
      swapped for a plain studio one, as the prompt asks.
- [ ] **Old renders stay on disk if an outfit's item is deleted.** The outfit row keeps the
      render (and the item id); there's no outfit cleanup at all yet.

## Later (stage 3)

- [ ] Clean up garments that overlapped in the photo with AI image editing instead of asking
      for a retake (`TODO (stage 3)` in `api/main.py`).
