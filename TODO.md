# TODO

Backlog for the user to prioritize. Don't start these without being asked.

Known issues and loose ends, to fix when there's time. Newest at the top of each section.

## Stage 1 (Wardrobe) follow-ups

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
