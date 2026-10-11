# TODO

Backlog for the user to prioritize. Don't start these without being asked.

Known issues and loose ends, to fix when there's time. Newest at the top of each section.

## Stage 4 (Social) follow-ups

- [ ] **Jake's older items are not shared.** Items uploaded before stage 4 kept `shared = 0`;
      only new uploads default to shared. Flip them with `PATCH /items/{id} {"shared": true}`.
- [ ] **Lent-out items still show as available.** An item on an accepted loan still appears in
      shared closets and stylist results, for its owner and for other friends.
- [ ] **The career fair demo borrows everything.** Adam owns one casual tee, so all three real
      outfits were made only of Jake's or Maya's pieces. Adam needs more of his own clothes for
      "prefer own, borrow to fill gaps" to show.
- [ ] **No auth on borrow actions.** `PATCH /borrow/{id}` trusts the `user_id` in the body.

## Stage 2 (AI styling) follow-ups

- [ ] **Style results can go stale.** The Style tab keeps the last outfits in memory across tab
      switches; editing or deleting one of those items in the Closet doesn't update the cards.
- [ ] **Alternatives use the hardcoded weather** (`styling.CITY` -> `get_weather`), not the
      weather the user typed in their request.
- [ ] **Preferences never fade.** Swap scores only add up; an old swap counts as much as today's.
- [ ] **`users.preferences` starts as `[]` on migrated rows** (`add_missing_columns` gives every
      JSON column `DEFAULT '[]'`). Code reads it with `or {}`, so it's harmless.

- [ ] **Stylist is slow (~40s).** One real `POST /stylist` took 40s (agent call with tools + a
      structuring call). Needs a good loading state in the UI; could also try lower thinking
      budget or skipping the second call.
- [ ] **`get_weather` is hardcoded** (58°F, light rain) in `api/tools.py`.
- [ ] **Only one outerwear piece per outfit.** On a cold rainy day the stylist can't layer the
      warm hooded jacket under the rain shell; it puts a warm top under the shell instead.
- [ ] **Reasons can invent details.** One outfit called a hoodie "fleece" though no tag says so.
      The prompt could say to describe items only from their tags.
- [ ] **Outfits repeat when options are thin.** With one rain-ok pair of shoes and one rain
      jacket, all 3 outfits share them. Expected, but worth a "add rain shoes" hint in the UI.

## Stage 1 (Wardrobe) follow-ups

- [ ] **Cutouts sometimes cut off parts of the garment.** Seen on jake's flat-lay / hanger /
      product photos, so it's the u2net path (padded crop -> `rembg.remove`), not cloth-seg.
      Likely causes: Gemini's `box_2d` is tighter than the garment and the 5% `PAD` doesn't
      cover it, or u2net drops low-contrast parts (sleeves, straps, laces). Things to try:
      bigger padding, running u2net on the whole photo and then cropping, or rembg's
      `alpha_matting` option.
- [ ] **Odd `weather_ok` tags on accessories.** Gemini tagged a belt rain/snow-ok, so the
      stylist adds it as a "weather" piece. Could limit `weather_ok` to shoes and outerwear
      in the prompt, or ignore it for accessories.
- [ ] **Shoe pairs may show up as two items.** On a full-body photo Gemini listed the left and
      right sneaker separately. The prompt now says "a pair of shoes is one garment"
      (`api/gemini.py`), but that hasn't been checked against a real photo yet.
- [ ] **Overlap notice always shows for worn photos.** On `on_body` photos Gemini marks pants as
      overlapping because the shirt covers the waistband, so "These items overlap" appears every
      time. Possible fix: skip the overlap check when `photo_type == "on_body"`.
- [ ] **Fit is marked confirmed too early.** If Gemini returned `unknown` silhouette and length
      and the user sets only the silhouette, `fit_confirmed` becomes true (as specced) and the
      amber dot disappears while length is still `unknown`.
- [ ] **"Retake" is only a label.** Items flagged `needs_retake` show a badge, but there's no
      way to replace an item's photo; you have to delete the item and upload again.
- [ ] **Abandoned uploads leak.** Closing the app while the "Found N items" sheet is open leaves
      the photo, its crops and the pending `uploads` row behind. Cancel and Retake clean up
      fine. Possible fix: delete pending uploads older than a day on startup.
- [ ] **`unknown` is a selectable chip.** Users can pick "unknown" for silhouette and length
      themselves. Harmless, but slightly odd.

## Repo / housekeeping

- [ ] `web/README.md` is still the create-next-app boilerplate. Delete it or point it to the
      root README.
- [ ] Old test images from before file cleanup existed are still in `api/static/uploads/` and
      `api/static/cutouts/` (git-ignored, so only local clutter).

## Later (stage 3)

- [ ] Clean up garments that overlapped in the photo with AI image editing instead of asking
      for a retake (`TODO (stage 3)` in `api/main.py`).
