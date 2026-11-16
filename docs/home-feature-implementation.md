# Home and My Space

Implemented on `person3/home-feature`, based on Person 3 commit `4bc42e4`. The earlier five-tab concept is superseded by the user's four-tab direction.

## Navigation and practice

- Four primary destinations on phones and desktop: **Home · Discover · Debate · My Space**.
- **My Space** contains **Avatar / Room**. Avatar retains its separate boy/girl wardrobes, purchase/equip rules, care and settings. There is no Progress segment.
- The whole Home companion card (level, XP, streak and avatar) opens Progress. Learning history, Dictionary, milestones and contextual saved-word links remain available.
- Home combines a compact daily priority card with four illustrated activity tiles: Spin & Speak, Read aloud, Word review, Read & respond. The reading-response tile opens Discover's existing practice reads. Daily completion and draft resume use real account state.
- `/play` redirects Home. `/profile` and `/avatar` redirect `/space`. `/room` opens Room with My Space selected. Existing garden/homeland aliases still open Debate.
- Latest flexible planning boards and spoken reading reflections are preserved; ReadAloud implementation is unchanged.

## Room interaction

The first visit grants five free furniture pieces and a saved starter layout. Furniture is independent transparent art, positioned on an isometric8×8 floor. There are twelve items in this first collection, one owned copy of each supported.

Users drag from the collection to place items, or drag an existing piece to reposition it. There is no Move button or directional pad. Rotate changes between two mirrored orientations; Put away returns an owned piece to the tray. Valid drops show a footprint; invalid overlaps or positions outside the room keep the previous arrangement. The rug can sit under furniture.

Editing uses a focused screen with Save and Cancel. Changes remain an owner-scoped draft until saved. Cancel requires a decision if the arrangement changed. Local drafts recover across reloads; server saves reject stale versions and retain the user's draft for review. Saving a layout never spends Coins.

The furniture shop uses the existing wallet and authoritative prices. Confirmation shows the price and remaining balance; purchase grants ownership without automatically placing an item. Retrying a lost purchase response reuses the request ID. Insufficient funds disable confirmation. Purchases, wardrobe spending and food share the same account lock and Coin ledger.

## Assets

- Preview: `artifacts/home-feature/furniture-preview.png`.
- Twelve individual transparent furniture sprites: `assets/room/generated/`.
- Provenance and full built-in image-generation prompts: `assets/room/ASSETS.md`.
- `bounds.json` records measured alpha bounds for runtime alignment; original generated pixels are unchanged.
- `RoomBackdrop.tsx` creates the room walls, floor and window with the same projection used by dragging. `ActivityArt.tsx` supplies four original pixel symbols for the Home activities.

The earlier concept images are design references. The real implementation screenshots are captured under `artifacts/room/` and `artifacts/role3/`.

## Persistence and deployment

Local SQLite receives the additive room schema at startup. Hosted PostgreSQL needs `supabase/migrations/202611160001_rooms.sql` applied using the existing migration workflow **before deploying this feature**. The migration adds room profiles and inventory; purchases use the existing Coin ledger. Account export includes rooms and deletion cascades to room records.

No production migration or deployment is performed by this task. No provider calls are needed for room functionality.

## Validation

- Final web export: `64c6ef4417edaaa5a730a713e52a77e8`. Typecheck and full uncached Expo lint pass.
- **7 room browser scenarios pass**: mouse and genuine phone-emulated touch dragging, immediate follow-up actions, tray placement, invalid drops, save/reload/cancel, draft recovery, version conflict, confirmed purchase and lost-response retry, insufficient Coins, owner isolation and sign-out/delete cleanup. Log: `artifacts/home-feature/room-browser.log`.
- **8 existing Role 3 browser flows pass**, including four-tab navigation, Home draft resume and activity entry, Progress, wardrobe, food and debate. Log: `artifacts/home-feature/role3-browser.log`. These ran before the final room-only sizing and tray-label fixes.
- Full API regression: **408 passed, 0 failed, 3 optional live-cloud checks skipped**. Log: `artifacts/home-feature/api-tests.log`.
- Final room, editor and purchase captures at320px and standard phone sizes were visually reviewed. Tests explicitly check canvas bounds, visible tray label height and the Save control. No production gesture workaround was needed after testing realistic, frame-paced touch input.
- Signing out or deleting an account clears that owner's room draft after pending writes finish, without clearing another owner's draft.

Physical-device gestures still need device validation; browser touch emulation does not establish native iOS/Android behavior. Cloud migrations were not exercised against a live production database.
