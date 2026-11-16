# UI polish integration decisions

Incoming branch: `origin/ui-polish` at `cbc0251`. The integration keeps `person3/home-feature`'s current interface as the visual source of truth.

## Retained product design

The existing Home / Discover / Debate / My Space navigation, Home activity hub, Avatar / Room segments, room decoration, six-neighbour street, generated scenery, single-boss tournament, wardrobe, food, approved logo and muted light palette remain. The incoming five-tab shell, appearance system, broad component restyling and replacement onboarding are not activated.

## Compatible incoming functionality

The branch includes the `1ecefa1` random debate stance and five-minute preparation flow, followed by `b649b2e` fixed-motion and web-animation corrections. These functional changes are integrated into the current debate presentation rather than replacing it with the branch's later themed presentation. The branch's old visual screenshots describe its own checkpoint, not the merged application's current design.

All new street, boss-practice and competitive tournament starts now roll a side. The server assigns and persists the side once; retries and refreshes cannot reroll it. Tournament records store that resolved side, and new tournaments still contain only Chair Lin. Historical sessions and explicit-side API requests remain compatible. Practice motions stay fixed as on the incoming branch, while tournament setup retains its Singapore topic choices.

After the roll, learners have five minutes to prepare with a notepad, mind map or drawing. They can start early, save and leave, or resume the same deadline. Notes carry into the match. The timer opens the battle when it expires; it never submits an argument automatically. No opponent or judging request runs during preparation. Local practice stays unscored when credentials are absent.

## Invisible web loading changes

`src/theme/fonts.ts` keeps the exact existing native TTF files and family names. Its `.web.ts` counterpart uses the branch's full-glyph WOFF2 versions of DM Sans, Lora and Feather. No theme provider or new native dependency is introduced. The root layout's geometry, colours and provider ordering are unchanged; its font-loading spinner now has an accessible label.

The web export runs `scripts/prepare-web.mjs` to preload those fonts and emit Brotli/gzip companions for public text assets. `server/static.mjs` negotiates those companions only for exported public files, keeps hashed assets immutable, leaves HTML navigation uncached, and excludes API routes and paths outside the export directory. Private recordings remain outside that root. The existing static-server regression covers compression, identity, HEAD, API bypass, dotfiles, traversal and client-side route fallback.

Native font appearance is unchanged. Production performance depends on the deployment's asset-serving path; local compression is not a claim of a measured production speed increase.

## Integration baseline and validation

The preserved design is commit `17882fbb7f5cf66a4aa8a627e0bc402ff51594db` on `person3/home-feature`. It was clean before merging. A local ignored ZIP snapshot of that commit was created before resolving overlapping files. No credentials, production data or environment files are changed by this integration.

The full API regression completed with 413 passes, zero failures and three optional cloud-dependent skips. The 20 focused debate/static-server cases also passed, including rolled single-boss preparation, ownership, duplicate requests and saved deadlines. Competitive browser judging uses an offline fixture, not paid provider calls. Physical-device and live-provider checks are outside these results.

Final checks on 16 November 2026:

- `npm run typecheck`, `npm run lint -- --no-cache` and `npm run build:web` passed. Final export: `entry-81e628a8c69eb842480103715354a2cc.js`, five font preloads.
- Role 3 browser journeys: 11 passed; single-boss judged fixture: 1 passed; preparation: 3 passed; room: 7 passed. Preparation was rerun after correcting stale local-draft cleanup on Save & leave. Room was rerun against the final export.
- The initial room touch test failed because Chromium suppressed the synthetic tap immediately following a drag. The test helper now separates those gestures by 400 ms and uses Playwright's touchscreen tap for buttons. Repeated touch checks and the full suite pass; room product code is unchanged.
- Home, Discover, My Space, the street, preparation, lobby and victory screenshots were inspected. Current evidence is in `artifacts/role3/`, `artifacts/debate-preparation/` and `artifacts/room/`.
- The protected navigation, shared visual components, artwork, room, logo and wardrobe files match `17882fb`; the debate screens contain only the integration changes described above. Dependency versions and the lockfile remain unchanged.
- The existing local preview database was retained. `http://localhost:3025/` and `/api/health` return 200 and serve the final export. No deployment or remote push is part of this merge.
