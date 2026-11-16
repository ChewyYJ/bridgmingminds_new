# Connected learning UI — implemented 16 November 2026

Implemented the approved five-tab and debate/care concept boards with the quieter cream, taupe and charcoal palette from the reference. This is the real Expo app, using the existing account data and server rules.

## Navigation and daily learning

- Mobile tabs remain **Home · Play · Discover · Debate · Profile**. Desktop uses the same destinations in a sidebar.
- Home puts the equipped chibi, level, XP and streak beside today's two activities. One primary action starts the next activity or resumes an owner-scoped draft from the same day. Opening an activity never marks it complete.
- Play focuses on Spin & Speak, Read aloud and Word review; debate lives in its own tab. Existing enrollment and learning flows are retained.
- Discover separates practice summaries from publisher headlines. A horizontal category strip saves space; source/date and Read & respond belong to the actual article. The decorative library art is not presented as an article photograph.
- Profile presents Avatar and Progress consistently, with Settings available in both. Progress retains the existing learning records and milestones.

## Avatar and care

- The existing approved layered avatars, animations and separate boy/girl collections are preserved.
- A compact room preview shows the full-body avatar and matching chibi, with explicit Preview/Equipped states. Hair, Tops and Bottoms are primary categories; More exposes Jackets, Hats, Shoes and Accessories. Owned/Shop filters apply to each category.
- Buying confirms the actual server price and adds ownership; Equip look remains a separate action. Restore equipped look is available. Lost-response retries retain the purchase key.
- Food starts with an idle avatar. Selection alone does not animate eating or spend Coins. Preview animation is labelled and reversible. Only a successful server receipt shows Served, the matching food animation, the actual fullness change and Coin charge. Done returns to Profile.

## Debate

- The street shows one nearby challenger and a clear practice action. Walking remains accessible with labelled controls and respects reduced motion. The panorama uses fine pixels at 2x and aligns the avatars with the pavement.
- The Singapore Civic Cup displays the selected motion, stance, difficulty, three opponents and topic background before entry. Without a provider key, a useful unscored Chair Lin practice action replaces an unavailable competitive start.
- Active matches and results hide the global shell. Record/Write share one response panel; the timer is optional and earlier turns expand on request.
- Save & leave flushes the latest owner-scoped draft in order before navigation. Unsaved recording capture/review stays in the match; uploading/submitting blocks exit. Storage failures retain the editor. Submitted turns, pending retry keys and private recording IDs remain recoverable.
- Results show What worked and Try next time before the saved reward receipt. Victory requires the existing validated judge outcome. Reward limits and local unscored practice remain explicit.

## Art and colour

The generated scenic background is no longer referenced by active screens. Replacement scenery bundles CC0 artwork from ZaninDevelopers and GustavoSaraiva, combined with original SVG architectural details. Source PNGs are unchanged; a display-time filter tones down their colours. The street is a fictional setting, not a claim to depict a Singapore landmark.

See [source links and licences](../assets/role3/licensed/CREDITS.md). Replacement scenic images require no runtime third-party image requests. No image-generation service was used for these replacement backgrounds.

Core colours: background `#FAF8F5`, surface `#FFFDFB`, text `#292623`, primary action `#34312E`, secondary surface `#ECE6DF`, border `#DDD5CC`.

## Verification

- Node 24 typecheck, Expo lint and production web export pass.
- Final export: `3374a6ebff5498eb107d3b48f6c027eb`.
- Eight real browser scenarios pass on that export, covering 320px, 390px and desktop layouts, all five destinations, real enrollment/draft resume, filter geometry, wardrobe purchases/equipping, all three foods, recording review, immediate Save & leave and saved debate recovery. Log: `artifacts/role3/ux-browser.log`.
- The dedicated tournament browser test passes all three rounds through the final boss with a test-only mocked provider. The real server validates evidence, computes outcomes and applies reward limits. Log: `artifacts/role3/ux-boss-browser.log`. This validates integration, not live-model quality.
- Full API regression suite: **399 passed, 0 failed, 3 optional live-cloud checks skipped**. Log: `artifacts/role3/ux-api-suite.log`. An initial sandboxed run could not access local sockets; the permitted local-network rerun passed.
- Browser captures under `artifacts/role3/` were inspected for layout, text, avatar fit and source art. Physical-device audio and native rendering still need device validation.

The existing preview at `http://localhost:3025/` serves the final export and keeps its separate preview database. No real provider calls, production data changes or deployment were needed.
