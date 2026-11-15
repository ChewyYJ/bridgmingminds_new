# Avatar sprites

The avatar art is cut straight out of the BridgingMinds UI mock
(`assets/avatar/source/bridgingminds-mock.webp`), so it looks exactly like the
mock. Motion is added with small pixel shifts: no new drawing.

| Animation | Sheet                             | Frames | FPS | What moves                                    |
| --------- | --------------------------------- | ------ | --- | --------------------------------------------- |
| `idle`    | `assets/avatar/avatar-idle.png`   | 8      | 4   | Breathing (upper body) and one blink          |
| `walk`    | `assets/avatar/avatar-walk.png`   | 8      | 8   | Each foot steps in turn, body dips on contact |
| `cheer`   | `assets/avatar/chibi-cheer.png`   | 8      | 10  | Quick hops, sway, flickering rays             |
| `eat`     | `assets/avatar/chibi-eat.png`     | 8      | 6   | Noodles slurp upward, nod, steam, sparkles    |
| `victory` | `assets/avatar/chibi-victory.png` | 8      | 8   | Big stretch-jump, pulsing rays, twinkles      |

`assets/avatar/avatar-portrait.png` is the round profile head from the mock.

Each sheet is one row of equal frames. Sizes, FPS and loop points live in the
generated `src/avatar/sprites.ts`.

## Limits

- One outfit and one character. The mock is a flat picture, so clothes cannot be swapped.
- The chibis are waist-up, as in the mock. Hops stretch the jacket instead of
  moving the whole sprite, so the waist cut never shows.
- Walking is a step-in-place cycle. Move the sprite across the screen and pass
  `facing="left"` to mirror it.

## Using it

```tsx
import { AvatarSprite } from "../avatar/AvatarSprite";

<AvatarSprite animation="walk" scale={2} facing="left" />;
```

`scale` is the on-screen size of one art pixel. On web the image is drawn with
`image-rendering: pixelated`, so it stays crisp. When reduced motion is on, the
first frame is shown without animating. All animations are previewed at `/avatar`,
which you can open from Profile with **My avatar**.

## Rebuilding the sheets

Needs Python 3.10+ with Pillow and numpy (`pip install pillow numpy`). From the repo root:

```bash
python scripts/avatar/build_mock_sprites.py --preview ./tmp/avatar-gifs
```

The script rewrites the PNGs and `src/avatar/sprites.ts`. `--preview` also writes
animated GIFs for a quick look. Crop boxes and the measured eye, waist and leg
coordinates are at the top of each `build_*` function. If the mock changes,
update them there.
