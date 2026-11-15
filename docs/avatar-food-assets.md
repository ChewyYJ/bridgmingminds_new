# Pixel food assets

Three transparent PNGs generated with the built-in ImageGen tool for the BridgingMinds avatar food collection. Originals were copied into the repository without background replacement or repainting. They use warm cream, terracotta, amber and muted sage to match the avatar presentation.

| Asset | File | Intended display |
| --- | --- | --- |
| Ramen | [ramen.png](../assets/avatar/food-v1/ramen.png) | 64–128 px food card/icon |
| Onigiri | [onigiri.png](../assets/avatar/food-v1/onigiri.png) | 64–128 px food card/icon |
| Bento | [bento.png](../assets/avatar/food-v1/bento.png) | 64–128 px food card/icon |

The static app asset map is `src/avatar/food-assets.ts`. The standalone wardrobe preview includes a downloadable food gallery. These designs also supply the chibi's held food in `scripts/avatar/illustrated/meals.mjs`: ramen uses `eat`, onigiri uses `eatOnigiri`, and bento uses `eatBento`. The ramen animation uses the separate `ramen-held.png` edit without resting utensils; the original `ramen.png` remains the gallery icon. Each action has eight frames with coordinated sleeves, hands and food movement. Onigiri is held with two hands; ramen lifts noodles and bento lifts a bite with chopsticks. The adult remains idle while the chibi eats.

Choose a food and **Eat** in the studio or standalone preview. Food selection is temporary preview state, outside the saved outfit. No coin prices, fullness effects or inventory records are introduced. The [focused head and meal audit](avatar-modular.md#focused-head-fit-and-food-audit) documents rendered coverage and its limits; source/PNG hashes in its review record identify what was actually inspected. It is not physical-device validation.

## Held ramen variant

[`ramen-held.png`](../assets/avatar/food-v1/ramen-held.png) is the animation-only bowl without resting utensils. It was edited from the original ramen PNG with the built-in ImageGen tool, preserving transparency. The food card keeps the original icon; the eating animation supplies its own moving chopsticks and noodle strands.

Exact edit prompt:

Use case: precise-object-edit. Image1 is the edit target: an existing transparent pixel-art ramen bowl asset. Remove ONLY the pair of brown chopsticks resting across its back rim. Reconstruct the small occluded portions of the bowl rim and broth naturally. Preserve the exact bowl design, red rim, cream exterior with sage motifs, egg, mushrooms, noodles, scallions, warm palette, finely pixelated rendering, three-quarter perspective, size and placement. There must be NO utensils, hands, floating noodles or steam. Preserve genuine transparent background. This is the held bowl for an animation; separate animated chopsticks will be layered over it in code.

## Original icon generation prompts

### ramen

Use case: stylized-concept. Asset type: transparent food inventory icon for the BridgingMinds pixel avatar app. Create one single isolated food item, centered on a genuinely transparent square canvas, generous empty padding, no text, no border, no logos, no shadow outside the object. Style: adorable finely pixelated Japanese cozy game art. Native 128-pixel-style drawing enlarged crisply, small neat pixel clusters and stepped edges, no blur, no huge chunky pixels, no photorealism. Warm charcoal/brown outlines, soft cream highlights, muted earthy taupe, sage green and restrained amber/coral accents. Slight three-quarter view from above, clean silhouette readable as a small 64–96px app icon. Two or three cel shading tones per material. Object occupies about 76 percent of the canvas. Subject: one small cream ceramic ramen bowl with a terracotta-red rim, golden broth, tidy noodle curls, half a soft-boiled egg with warm amber yolk, two slices of mushroom, and a few muted green scallions. A small pair of simple brown chopsticks rests neatly along the back rim. Inviting, cute, compact. No face on the bowl; no steam or detached floating elements.

### onigiri

Use case: stylized-concept. Asset type: transparent food inventory icon for the BridgingMinds pixel avatar app. Create one single isolated food item, centered on a genuinely transparent square canvas, generous empty padding, no text, no border, no logos, no shadow outside the object. Style: adorable finely pixelated Japanese cozy game art. Native 128-pixel-style drawing enlarged crisply, small neat pixel clusters and stepped edges, no blur, no huge chunky pixels, no photorealism. Warm charcoal/brown outlines, soft cream highlights, muted earthy taupe, sage green and restrained amber/coral accents. Slight three-quarter view from above, clean silhouette readable as a small 64–96px app icon. Two or three cel shading tones per material. Object occupies about 76 percent of the canvas. Subject: one rounded triangular Japanese rice ball, ivory rice with small controlled pixel grain details, a dark muted sage nori seaweed rectangle wrapping the bottom front, subtly toasted warm cream edges. Single compact onigiri, no plate, no garnish, no face and no detached floating elements.

### bento

Use case: stylized-concept. Asset type: transparent food inventory icon for the BridgingMinds pixel avatar app. Create one single isolated food item, centered on a genuinely transparent square canvas, generous empty padding, no text, no border, no logos, no shadow outside the object. Style: adorable finely pixelated Japanese cozy game art. Native 128-pixel-style drawing enlarged crisply, small neat pixel clusters and stepped edges, no blur, no huge chunky pixels, no photorealism. Warm charcoal/brown outlines, soft cream highlights, muted earthy taupe, sage green and restrained amber/coral accents. Slight three-quarter view from above, clean silhouette readable as a small 64–96px app icon. Two or three cel shading tones per material. Object occupies about 76 percent of the canvas. Subject: one compact rounded rectangular Japanese bento box in warm muted terracotta and charcoal, lid removed, seen three-quarter from above. Tidy compartments contain ivory rice with one small coral umeboshi, golden rolled omelette, muted sage broccoli and two small glazed mushroom bites. Rounded cozy silhouette, restrained food details, no separate lid, no utensils, no detached floating elements.

