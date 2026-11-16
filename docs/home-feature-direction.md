# Home and My Room — design proposal

Prepared 16 November 2026 on `person3/home-feature`, based on the fetched tip of `origin/person3/feature-trying-out`, commit `4bc42e4`. This proposal and its generated mockups are design artifacts, not implemented app screens or usability-test results. Example progress, balances, furnishings and prices are illustrative.

## Navigation

**Home · Discover · Debate · My Room · Profile**

Remove Play as a top-level destination and consolidate its existing activities into Home. Keep Home as the familiar learning starting point. Use an armchair icon for My Room, distinguishing the decoration destination from Home's house icon.

| Destination | Responsibility |
| --- | --- |
| Home | Today's practice, draft resume and a visible activity library. |
| Discover | Practice reads, news, article context and reading responses. |
| Debate | Street opponents, Singapore Civic Cup, friend conversations and match history. |
| My Room | The saved room, furniture inventory, arranging items and furniture shopping. |
| Profile | Avatar clothing/customisation, learning progress, Dictionary, care and settings. |

## Home hierarchy

1. Compact companion strip: equipped upper-body chibi, level, XP and streak. Avoid a tall decorative hero pushing practice off screen.
2. One priority card: today's completion state, actual next activity or saved draft, and one Continue practice action. Read aloud and Spin & Speak remain the two daily activities; other activities are optional.
3. Four recognisable activity tiles: **Spin & Speak** (dice/microphone), **Read aloud** (book/sound), **Word review** (word cards), **Read & respond** (article/pencil). The last tile opens Discover's existing practice-read selection; it is a shortcut, not a duplicate article catalogue. Each tile has a readable label alongside its pixel illustration.
4. A quiet room shortcut below learning. Do not use decorating as a required completion step or a prerequisite for practice.

The priority card explains what is next; the tiles provide access to every activity, including completed ones. When today's work is complete, replace Continue practice with a neutral completion message and let the activity library remain available. Preserve draft ownership, existing rewards and saved planning state. The new Notepad/Mind map/Draw tools and spoken reading responses remain within their established learning flows.

## My Room

### Viewing

Lead with the saved isometric room. Include a furnished starter space at no Coin cost so the feature is useful immediately. Keep some floor space clear. Show the equipped avatar seated behind a desk, using an upper-body chibi with legs hidden; the existing full-body adult remains for street and wardrobe previews. The overview has one primary **Decorate room** action and secondary **Furniture shop** and **Your collection** rows. Do not display placement controls until editing starts.

### Arranging owned furniture

Use a focused editor with a persistent room canvas and compact inventory tray. Replace global navigation temporarily with explicit **Cancel** and **Save room** controls. Category options: Seating, Tables, Storage, Decor, Walls and Floors; use a horizontal labelled strip rather than crowding all controls into the first view.

Support tap-to-select/tap-to-place and accessible directional position buttons as well as dragging. Show a placement grid only while useful; mark the selected item's footprint clearly. Provide Rotate, Move and Put away; Put away returns the item to inventory. Save affects placement only and never spends Coins. Cancelling restores the last saved layout; a pending unsaved layout needs an explicit leave decision.

Furniture needs consistent floor footprints, wall attachment rules and front/back layering. Reject overlaps and out-of-bounds placement with a visible explanation. Wall art attaches to walls; lamps/books can sit on supported surfaces. Rotating furniture requires authored matching views; do not arbitrarily mirror objects with directional lighting. Keep avatar seating and furniture occupancy coherent. Provide a list-based arrangement alternative and reduced-motion support.

### Shopping

Separate **Owned**, **Preview** and **Placed** states. Browsing or previewing never charges Coins. A purchase confirmation names the item, price, current balance and remaining balance. A successful server receipt adds the item to inventory; placement is a separate action. Cancelling room edits does not refund a completed purchase. Lost-response retries must reuse the original purchase key, following wardrobe's existing purchase convention.

Use the existing Coin balance across furniture, clothes and meals. Illustrative starter ranges: small decor 10–25 Coins, lamps/chairs 30–60, desks/shelves 70–120, statement furniture 150–250. A 30-Coin lamp represents six days of the current five-Coin daily practice base before other rewards or spending; a 150-Coin item represents 30 days. Keep starter furniture free and offer some earned decorations so the room does not depend on long saving periods. These are proposed values, not modifications to the current economy. No second currency, paid entry, energy gate, compulsory feeding or learning bonus from expensive furniture.

## Visual direction

Keep the existing warm neutral tokens: background `#FAF8F5`, surface `#FFFDFB`, text `#292623`, primary action `#34312E`, secondary surface `#ECE6DF`, border `#DDD5CC`. Restrict colour to oat, walnut, muted sage and small antique-gold accents. Typography stays crisp and conventional; pixel treatment applies to art.

Use fine pixel art on a consistent 2:1 isometric grid with shared lighting and object scale. The supplied furniture sheet is a visual reference, not an asset licence. The generated concept art is for design evaluation; production furniture requires original or appropriately licensed modular assets, transparent layers, occupancy data and rotation variants. Do not cut furniture out of the mockup and treat it as production-ready artwork.

## Implementation considerations

- Create a distinct `/room` destination. Existing `garden` and `homeland` aliases already mean Debate; preserve their established destination.
- Remove Play from both mobile and desktop navigation. Preserve old `/play` links with an intentional redirect to Home's activity section. Update the completed-practice action in `DailyWorkout.tsx`, which currently sends learners to `/play`.
- Build on the latest Person 3 planning and spoken-reflection changes; do not replace those flows with mock UI.
- Existing garden decoration records use legacy currency and fixed IDs. They are not a furniture-placement backend and must not be reactivated as one.
- Introduce a versioned furniture catalogue, account-owned item instances and saved room placements. Validate purchases, rotations, occupancy, ownership and layout updates server-side; protect against duplicate purchases and stale multi-device saves. Supply local and cloud migrations and an idempotent starter-room grant.
- Keep the mobile editor responsive at 320px and with larger text. Aim for at least 44px controls. In actual implementation, measure text contrast, verify screen-reader labels, room canvas/list interaction, scroll boundaries and item placement; a generated image does not verify accessibility.

## Suggested build order and checks

1. Consolidate Home and navigation while preserving learning routes and saved drafts.
2. Add the free starter room and owned-item arrangement with saved layouts.
3. Add Coin purchases and explicit receipts, then earned trophy displays and further furniture sets.

Verify: every former Play activity still reachable; today's completion and saved drafts unchanged; cancel and failed-save recovery; placement validity; restore after relaunch; cross-account isolation; purchase confirmation, insufficient funds and lost-response retry; no duplicate charges; shared balance updates; reduced motion and non-drag controls. Test 320px, typical phones, desktop and native touch behavior.

Concepts: `artifacts/home-feature/navigation-concept.png` and `artifacts/home-feature/room-concept-final.png`. Built-in image generation was used; prompts are retained beside the images. The earlier room concept is retained as a draft; its purchase confirmation wording was corrected in the final image.

Repository lint and typecheck pass on this branch. No application code, database, economy or deployed screens were changed by this design task.
