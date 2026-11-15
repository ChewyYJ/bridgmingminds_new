# Illustrated modular avatar pack

The current default is `bridgingminds-illustrated-v5-meals`: **42 wearable designs**, with three choices in each of seven categories for each separate boy and girl collection. The categories are hair, hats, tops, jackets, bottoms, shoes and accessories. A single outfit selection controls the adult character and its chibi bust; bottoms and shoes appear only on the adult. Palette variations do not count as additional designs. The asset directory remains `assets/avatar/illustrated-v2/` so existing import and preview paths stay stable.

This edition uses **ImageGen-created raster artwork**, compiled from five preserved sources in `assets/avatar/illustrated-v2/source/`: `character-master.png`, `girl-kit.png`, `boy-kit.png`, `details-kit.png` and `pixel-faces-v3.png`. The details sheet supplies complete individual shoes and six chibi hand-pose cells, including waving, fists, a supporting palm, chopsticks and relaxed hands. The replacement face sheet supplies simpler pixel eyes and expressions. The builder crops, registers, recolours, poses and applies the pixel finish to the illustrated pieces. It does not regenerate artwork during an ordinary build, and no third-party asset pack is included. See [art direction and source provenance](avatar-art-direction.md) and the [pixel face generation prompt](avatar-pixel-polish.md).

The earlier procedural v1 assets remain in `assets/avatar/modular-v1/`, and the original mock-based avatar remains available in the app under **Original preview**. The [earlier sprite documentation](avatar-sprites.md) describes that original preview. Neither earlier source set is deleted by the illustrated build.

## Proportions, motion and customisation

| Style key | Logical canvas | Pivot | Supported actions |
| --- | --- | --- | --- |
| `big` | 256 × 384 px | `[128, 367]` | Adult full body: idle/blink, walk |
| `chibi` | 256 × 256 px | `[128, 245]` | Upper-body bust: idle/blink, greet, speak, celebrate, ramen, onigiri, bento |

The chibi has **no hips, legs, trousers or shoes**. Its pivot is a presentation anchor for the bust, not a ground-contact point. The adult uses human proportions. Both use white presentation backgrounds. The compiler applies a common canvas-aligned **3 px grid to every chibi layer** and a finer **2 px grid to adult head, face, hair, hat and head-accessory layers**; adult clothing and limbs retain their finer raster detail. This is a build-time pixel finish, separate from display scaling.

The pack has eight named actions, each with **eight frames**: `idle`, `walk`, `greet`, `speak`, `celebrate`, `eat` (ramen), `eatOnigiri` and `eatBento`. Their timing is stored in the manifest: idle runs at 4 FPS; walking and celebration at 8 FPS; greeting, speaking and eating at 6 FPS. `styles[style].animations` determines which actions that representation supports. A request for another action falls back to idle: for example, the adult stays idle while the chibi eats, and the chibi stays idle while the adult walks. The previews label this fallback rather than implying both characters perform the action.

The **Eat** control uses the selected food to choose the concrete animation key. Food selection is temporary preview state, separate from the saved wardrobe. The meal layout drives the arms, sleeves, hands and selected food together: onigiri uses two gripping hands, ramen lifts noodles with chopsticks, and bento lifts a bite from its tray. The food artwork comes from the ImageGen PNGs in `assets/avatar/food-v1/`. Onigiri and bento use the same source as their food cards; ramen uses the `ramen-held.png` edit without resting utensils, while `ramen.png` remains its card icon. Long sleeves own the covered arm silhouette during meals, preserving the separate visible hands.

Left-facing previews mirror the complete layered character; they are not separate directional drawings. Walking is a step-in-place cycle, so a street screen must translate the adult separately. All equipped pieces share their representation's frame. A shared head transform registers the face, hair, hats and facial accessories to one head, with expression features placed inside a stable head silhouette. Reduced motion displays a still pose, and automatic playback stops when the app or browser tab is inactive. The standalone preview also allows deliberate frame stepping.

Selections include **five skin tones, seven hair colours and three eye colours** independently of clothing. Boy and girl wearables stay within their own collection. Switching collection resets wearables while preserving selected colours. Hats, jackets and accessories can be removed. Invalid or foreign-collection saved IDs fall back to valid defaults. Bottom and shoe thumbnails use the adult, so those choices remain visible despite the chibi's upper-body crop.

## Pack and app integration

The generated [manifest](../assets/avatar/illustrated-v2/manifest.json) defines the catalogue, palettes, dimensions, per-style actions, ordered layers, frame timing and atlas references. Style metadata includes `pixelSize` (`big: 2`, `chibi: 3`) and `pixelSlots`: adult slots come from `PIXEL_HEAD_SLOTS` in `scripts/avatar/illustrated/raster.mjs`, while the chibi includes every slot. Each frame maps a slot to `[cellIndex, offsetX, offsetY]`; the cell rectangle identifies its atlas page. Preserve these trim offsets and their pixel-grid phase when drawing cells so pieces remain aligned. Transparent PNG pages are bounded to 1024 × 1024 px, with padding and deduplicated cells. Outfit combinations are composed rather than exported individually.

`src/avatar/generated-pack.ts` imports the active manifest and its atlas pages from the retained `illustrated-v2` directory. `src/avatar/pack.ts` exposes the typed selection and layer resolver, backed by `shared/avatar-customization.mjs`. Body, facial features, clothing, hair and props are resolved separately. Hat-aware hair and jacket sleeve ownership control overlaps. The selected shirt remains available beneath an open jacket.

Rear straps and the far headphone cup use `accBack`, behind the body. The hanging bag pouch remains in `accMid`; hats cover overlapping head accessories. Bottoms use a shared jeans-based waist reference while retaining their own lower silhouette. Walking keeps the waist attached to the torso and gradually bends the legs below it, rather than placing a separate rigid hip panel over moving trousers.

Use `LayeredAvatar` from `src/avatar/LayeredAvatar.tsx` with a valid `selection`, optional `variant` (`big` or `chibi`), `animation`, `facing`, `scale` and `playing`. It restores atlas cells to one logical canvas, applies the style's supported action and draws the layers in order. Frames switch together after their required images are ready. One parent container scales and mirrors the composition, preserving relative layer positions. Web previews use pixel-preserving rendering for the compiled grid.

`WardrobeStudio` in `src/avatar/WardrobeStudio.tsx` previews both representations and offers category, colour, direction and playback controls. Open **Profile → My avatar → Customise avatar** (`/avatar`). It saves a look through existing account-scoped device draft storage using `avatar-wardrobe-v1`; the storage key is independent of the artwork edition. **Save look is local to that account on that device.** It does not create server inventory, grant ownership or unlocks, spend Coins, or synchronise equipment between devices. All 42 designs can be tried in this asset studio.

## Build, preview and verify

Use the project's Node.js 24 environment. The compiler uses repository raster/PNG/GIF tools; Python and a new ImageGen request are not required to rebuild existing source art.

```sh
node scripts/avatar/build-illustrated.mjs
```

This writes `assets/avatar/illustrated-v2/manifest.json` and atlas pages, updates `src/avatar/generated-pack.ts`, and refreshes the existing preview location `artifacts/avatar-modular/`. Source PNGs remain in `assets/avatar/illustrated-v2/source/`. Edit the illustrated rig/import logic or replace an intentionally revised source sheet, then rebuild; do not hand-edit generated manifest or asset imports.

Open the [illustrated asset preview](../artifacts/avatar-modular/index.html), or use PowerShell:

```powershell
Invoke-Item .\artifacts\avatar-modular\index.html
```

The preview uses the current compiled layers and supports collection/item/colour choices, style-appropriate actions, left/right mirroring, pause, individual frames and selection JSON download. It does not save an account look. Category and animation contact sheets, paired looks, animated GIFs and `catalog.json` are generated alongside it. Run `npm run dev` and open `/avatar` after onboarding to inspect the integrated screen.

The three standalone food PNGs, their provenance and generation prompts are documented in [Food preview assets](avatar-food-assets.md). They are presentation assets; this work does not add a food economy or inventory behaviour.

```sh
node --test tests/avatar-pack.test.mjs tests/avatar-attachments.test.mjs tests/avatar-food.test.mjs tests/avatar-wardrobe.test.mjs
npx playwright test --config tests/avatar-studio.config.ts
npm run lint
npm run typecheck
```

The pack and browser checks cover asset references, selection/composition, collection separation, saved-look restoration and account isolation, playback, mirroring and reduced motion. The attachment regression suite checks rendered head registration, accessory proportions and face visibility, iris containment, legless chibi output, and the common pixel grid in compiled atlas cells. It also checks actual hat/accessory and torso/strap occlusion, comparable waistband widths, smooth hip contours, shoe contact through walking, connected calf silhouettes without stray fragments, and lower-shirt continuity during arm gestures. These are test scopes, not a claim that a particular checkout has passed; run the commands after rebuilding. The wardrobe source suite also exercises the retained procedural garment implementation; it is not a substitute for inspecting the current illustrated output. The browser configuration builds a separate test app on port 3019 with test storage and an empty AI key. `PLAYWRIGHT_CHANNEL` and `AVATAR_BROWSER_PATH` can select an installed browser.

## Focused head-fit and food audit

```sh
node scripts/avatar/qa-head-food.mjs
```

The [head and food audit](../artifacts/avatar-modular/head-food-audit/index.html) follows up on the screenshot-reported bob/ponytail fit, large headphone cups and misplaced adult glasses, then checks the three eating actions. It renders **28 sheets / 264 tiles and six animated GIFs** at natural logical-canvas sizes: all three hairstyles with no accessory, glasses and headphones; adult idle/walk samples; chibi idle, greeting, celebration and each food's bite pose; all eight frames of every meal; and all 3 top × 4 jacket states at each bite pose, for both collections. Fixed colours are peach skin, espresso hair and hazel eyes. Hats, bags and other palettes are outside this focused visual pass.

The food regression suite separately traverses every meal frame and all **576** collection/meal/frame/top/jacket combinations. It checks distinct rendered performances, the held rice ball without stale bowls or chopsticks, and actual food visibility through clothing. Pack checks verify long-sleeve ownership without removing gripping hands or short-sleeve bare arms. The attachment suite measures actual painted spectacle lens openings against both pupil anchors and visible cup width/ear placement in every supported frame. `coverage.json` records rendered cases and source/image hashes. Visual approval is recorded separately in `visual-review.json`; generating a sheet does not approve it. This targeted follow-up does not renew the historical wardrobe audit's approvals.

## Earlier wardrobe audit

```sh
node scripts/avatar/qa-pairwise.mjs
```

This renders the current source rig with the production pixel finish into the [wardrobe audit](../artifacts/avatar-modular/wardrobe-audit/index.html), without rebuilding the shipped pack. Its fixed sampling plan is **488 labelled contact sheets and 4,932 rendered tiles**. The existing review record belongs to the earlier v4 source hashes; it does not certify later head or meal revisions. The sampler includes the original ramen action, not the two added meal actions:

| Group | Coverage | Sheets | Tiles |
| --- | --- | ---: | ---: |
| Category pairs | All 21 pairs among seven categories, both collections and styles, idle frame 0; removable hats, jackets and accessories include None | 84 | 984 |
| Head combinations | 3 hair × 4 hat × 4 accessory states; both collections; adult idle 0 / walk 2 / walk 6 and chibi idle 0 / greet 2 / speak 2 / celebrate 2 / eat 3 | 64 | 768 |
| Adult clothing | 3 tops × 4 jackets × 3 bottoms × 3 shoes × 4 accessories, both collections, idle 0 / walk 2 / walk 6 | 288 | 2,592 |
| Chibi clothing | 3 tops × 4 jackets × 4 accessories, both collections, all five sampled chibi actions | 40 | 480 |
| Seam close-ups | All top/bottom waist and bottom/shoe ankle pairs, both collections, idle and both walk extremes | 12 | 108 |

This is exhaustive within the named pairwise and focused groups. It is **not** the full cross-product of complete outfits, palettes and animation frames. Chibi baseline pair grids retain invisible bottom/shoe selections to show their intentional absence; chibi action grids omit these visual duplicates. Numeric tests traverse all eight frames of supported actions.

`coverage.json` records the exact selections, poses, source hashes and overview-to-sheet mapping. `waist-metrics.json` records measured painted waistband widths and their ratios to jeans. Overview pages support review at useful thumbnail sizes; open a source sheet to investigate a suspicious cell. Rendered coverage is separate from visual approval: the [visual review record](../artifacts/avatar-modular/wardrobe-audit/visual-review.json) lists reviewed filenames, image hashes, findings and limits. Approvals apply only to the recorded hashes; after regeneration, recheck changed images. Optional `--section=pairwise|head|outfit|seams`, `--collection=girl|boy`, `--style=big|chibi` and `--output=...` arguments allow focused reruns in a separate output folder.

Review the actual raster contact sheets and animated previews after changing source crops or transforms. Check garment seams, hair/hat overlap, frame alignment, exposed hands, food alignment and the clean lower edge of the legless chibi. These are assembled sprite animations, not separately illustrated full-body frames. Native-device performance and every possible outfit combination require further verification. Server-backed ownership/equipment and the future street, debate and reward screens remain separate work.

The legacy command `node scripts/avatar/build-modular.mjs` still rebuilds procedural v1. It also overwrites the shared generated import file and preview location, so rerun `build-illustrated.mjs` afterwards to restore the current default.
