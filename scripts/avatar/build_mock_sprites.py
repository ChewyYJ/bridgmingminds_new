#!/usr/bin/env python3
"""Build the avatar sprite sheets from the BridgingMinds UI mock.

The artwork is cut straight out of assets/avatar/source/bridgingminds-mock.webp,
so the avatar looks exactly like the mock. Motion (breathing, blinking, steps,
hops, slurping, steam, rays) is added with small pixel shifts on top of it.

Requirements: Python 3.10+, Pillow and numpy  (pip install pillow numpy)
Run from the repo root:
    python scripts/avatar/build_mock_sprites.py [--preview DIR]

Outputs
    assets/avatar/*.png     horizontal sprite sheets (one row of frames)
    src/avatar/sprites.ts   generated manifest used by <AvatarSprite />
"""
from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/avatar/source/bridgingminds-mock.webp"
OUT = ROOT / "assets/avatar"
MANIFEST = ROOT / "src/avatar/sprites.ts"


# ----------------------------------------------------------------- helpers --
def load_source() -> np.ndarray:
    return np.array(Image.open(SOURCE).convert("RGBA"))


def is_background(px: np.ndarray, light: int) -> np.ndarray:
    rgb = px[..., :3].astype(int)
    return (rgb.min(axis=-1) >= light) & ((rgb.max(axis=-1) - rgb.min(axis=-1)) <= 26)


def flood(mask_ok: np.ndarray, seeds: list[tuple[int, int]]) -> np.ndarray:
    """Pixels reachable from seeds through mask_ok (4-connected)."""
    h, w = mask_ok.shape
    seen = np.zeros((h, w), bool)
    q = deque()
    for x, y in seeds:
        if 0 <= x < w and 0 <= y < h and mask_ok[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and mask_ok[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((nx, ny))
    return seen


def border(h: int, w: int) -> list[tuple[int, int]]:
    return [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]


def cutout(src: np.ndarray, box: tuple[int, int, int, int], light: int = 214) -> np.ndarray:
    """Crop `box` and remove the flat light background around the artwork."""
    x0, y0, x1, y1 = box
    img = src[y0:y1, x0:x1].copy()
    h, w = img.shape[:2]
    bg = flood(is_background(img, light), border(h, w))
    img[bg] = 0
    # drop the pale anti-aliasing halo that touches the background
    alpha = img[..., 3] > 0
    near_bg = np.zeros_like(alpha)
    near_bg[1:, :] |= bg[:-1, :]
    near_bg[:-1, :] |= bg[1:, :]
    near_bg[:, 1:] |= bg[:, :-1]
    near_bg[:, :-1] |= bg[:, 1:]
    halo = alpha & near_bg & (img[..., :3].min(axis=-1) > 196)
    img[halo] = 0
    ys, xs = np.nonzero(img[..., 3])
    return img[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def components(mask: np.ndarray) -> list[np.ndarray]:
    """8-connected components of a boolean mask, largest first."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            comp = np.zeros_like(mask)
            q = deque([(x, y)])
            seen[y, x] = True
            while q:
                cx, cy = q.popleft()
                comp[cy, cx] = True
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((nx, ny))
            out.append(comp)
    return sorted(out, key=lambda c: -int(c.sum()))


def poly_mask(shape: tuple[int, int], points: list[tuple[float, float]]) -> np.ndarray:
    im = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon(points, fill=255)
    return np.array(im) > 0


def layer(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = np.zeros_like(img)
    out[mask] = img[mask]
    return out


def paste(canvas: np.ndarray, img: np.ndarray, dx: int = 0, dy: int = 0, alpha: float = 1.0) -> None:
    """Alpha-composite img onto canvas at an integer offset."""
    h, w = img.shape[:2]
    H, W = canvas.shape[:2]
    sx0, sy0 = max(0, -dx), max(0, -dy)
    dx0, dy0 = max(0, dx), max(0, dy)
    cw = min(w - sx0, W - dx0)
    ch = min(h - sy0, H - dy0)
    if cw <= 0 or ch <= 0:
        return
    src = img[sy0 : sy0 + ch, sx0 : sx0 + cw].astype(float)
    dst = canvas[dy0 : dy0 + ch, dx0 : dx0 + cw].astype(float)
    a = src[..., 3:4] / 255.0 * alpha
    out_a = a + dst[..., 3:4] / 255.0 * (1 - a)
    rgb = np.where(out_a > 0, (src[..., :3] * a + dst[..., :3] * (dst[..., 3:4] / 255.0) * (1 - a)) / np.maximum(out_a, 1e-6), 0)
    canvas[dy0 : dy0 + ch, dx0 : dx0 + cw, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    canvas[dy0 : dy0 + ch, dx0 : dx0 + cw, 3:4] = np.clip(out_a * 255, 0, 255).astype(np.uint8)


def blank(w: int, h: int) -> np.ndarray:
    return np.zeros((h, w, 4), np.uint8)


def extend_bottom(img: np.ndarray, rows: int) -> np.ndarray:
    """Overscan for waist-up art: repeat the last row so hops never show the cut."""
    last = img[-1:, :, :]
    return np.concatenate([img, np.repeat(last, rows, axis=0)], axis=0)


def luma(px: np.ndarray) -> np.ndarray:
    rgb = px[..., :3].astype(float)
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


# -------------------------------------------------------------- the avatar --
def build_avatar(src: np.ndarray) -> dict[str, list[np.ndarray]]:
    """Full-body avatar from the My Avatar screen: idle + walk."""
    a = cutout(src, (398, 180, 516, 402))
    a = a[:192].copy()  # drop the tab labels under the feet
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(int)
    # The light gap between the trouser legs is enclosed, so seed it explicitly.
    gap = flood(is_background(a, 205) & (a[..., 3] > 0), [(47, y) for y in range(140, 178)] + [(46, y) for y in range(160, 178)])
    a[gap] = 0
    # Remove the soft grey ground shadow under the shoes (bounded by the dark sole outline).
    soft = (a[..., 3] > 0) & (rgb.min(axis=-1) >= 105) & (np.ptp(rgb, axis=-1) <= 40)
    soft[:172] = False
    seeds = [(x, y) for y in range(h - 4, h) for x in range(w)] + [(x, y) for y in range(176, h) for x in (0, 1, w - 2, w - 1)]
    a[flood(soft, seeds)] = 0
    keep = components(a[..., 3] > 0)[0]
    a[~keep] = 0

    yy, xx = np.mgrid[0:h, 0:w]

    # Blink: paint each open eye shut with cheek colour and a thin lash line.
    blink = a.copy()
    lum = luma(a)
    skin = np.median(a[23:26, 61:64, :3].reshape(-1, 3), axis=0).astype(np.uint8)
    # Eye boxes measured on the mock (x0, x1, y0, y1), inclusive.
    for x0, x1, y0, y1 in ((54, 58, 21, 27), (65, 69, 21, 27)):
        box = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
        eye = box & (lum < 205)
        lash = a[eye][np.argmin(lum[eye])].copy()
        blink[eye, :3] = skin
        for x, y in ((x0, 23), (x0 + 1, 24), (x0 + 2, 24), (x0 + 3, 24), (x1, 23)):
            blink[y, x] = lash

    # Upper body (breathes / bobs) = above the belt + bag, strap hand, pocket hand.
    upper = (yy < 84) | poly_mask((h, w), [(16, 84), (50, 84), (50, 96), (46, 117), (16, 117)])
    upper |= poly_mask((h, w), [(68, 84), (86, 84), (86, 98), (68, 98)])
    pad_top = 2
    fw, fh = w + 4, h + pad_top + 1

    idle = []
    for f in range(8):
        breathe = [0, 0, 0, 1, 1, 1, 1, 0][f]
        base = blink if f == 5 else a
        frame = blank(fw, fh)
        paste(frame, layer(base, ~upper), 1, pad_top)
        paste(frame, layer(base, upper), 1, pad_top + breathe)
        idle.append(frame)

    # Walk: little steps — each lower leg lifts in turn while the body dips on contact.
    cut_y = 140
    split = [(50, 118), (49, 135), (48, 155), (46, 172), (45, 196)]

    def split_x(y: int) -> float:
        for (x0, y0), (x1, y1) in zip(split, split[1:]):
            if y0 <= y <= y1:
                return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
        return split[-1][0]

    sx = np.vectorize(split_x)(yy)
    lower_near = (yy >= cut_y) & (xx < sx)
    lower_far = (yy >= cut_y) & (xx >= sx)
    top = yy < cut_y
    walk = []
    body_dy = [1, 0, 0, 0, 1, 0, 0, 0]
    near_lift = [0, 2, 3, 1, 0, 0, 0, 0]
    near_dx = [0, 1, 1, 1, 0, 0, 0, 0]
    far_lift = [0, 0, 0, 0, 0, 2, 3, 1]
    far_dx = [0, 0, 0, 0, 0, 1, 1, 1]
    for f in range(8):
        frame = blank(fw, fh)
        paste(frame, layer(a, lower_far), 1 + far_dx[f], pad_top - far_lift[f])
        paste(frame, layer(a, lower_near), 1 + near_dx[f], pad_top - near_lift[f])
        paste(frame, layer(a, top), 1, pad_top + body_dy[f])
        walk.append(frame)
    return {"idle": idle, "walk": walk}


# ------------------------------------------------------------- the chibis --
def yellow(img: np.ndarray) -> np.ndarray:
    rgb = img[..., :3].astype(int)
    return (img[..., 3] > 0) & (rgb[..., 0] > 200) & (rgb[..., 1] > 150) & (rgb[..., 2] < 140) & (rgb[..., 0] - rgb[..., 2] > 90)


def split_effects(img: np.ndarray) -> tuple[np.ndarray, list[np.ndarray]]:
    """Main artwork (largest piece) and the loose effect pieces around it (rays, steam...)."""
    comps = components(img[..., 3] > 0)
    return comps[0], [c for c in comps[1:] if c.sum() >= 3]


def rise(img: np.ndarray, n: int, band: tuple[int, int]) -> np.ndarray:
    """Stretch (n > 0) or squash (n < 0) the rows inside `band`, so everything above
    moves up by n while the bottom edge stays put — a hop without showing the waist cut."""
    rows = list(range(img.shape[0]))
    band_rows = list(range(*band))
    if n == 0:
        return img
    picks = {band_rows[int((i + 0.5) * len(band_rows) / abs(n))] for i in range(abs(n))}
    out = []
    for r in rows:
        if n < 0 and r in picks:
            continue
        out.append(r)
        if n > 0 and r in picks:
            out.append(r)
    return img[out]


def build_eat(src: np.ndarray) -> list[np.ndarray]:
    e = cutout(src, (92, 782, 252, 932))
    h, w = e.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    main, pieces = split_effects(e)
    sparkle = np.zeros_like(main)
    steam = np.zeros_like(main)
    for piece in pieces:
        ys, xs = np.nonzero(piece)
        if yellow(e)[piece].mean() > 0.25:
            sparkle |= piece
        elif xs.mean() > 120:
            steam |= piece
    opaque = e[..., 3] > 0
    bowl = poly_mask((h, w), [(83, 101), (137, 101), (136, 112), (131, 124), (125, 133), (123, 141), (95, 141), (92, 133), (87, 124), (83, 112)])
    rgb = e[..., :3].astype(int)
    noodles = (xx >= 86) & (xx <= 102) & (yy >= 80) & (yy <= 104) & ~bowl & opaque
    noodles &= (rgb[..., 0] > 170) & (rgb[..., 1] > 140) & (rgb[..., 0] > rgb[..., 2] + 25)
    char = main & ~bowl

    pad_top, pad_x = 5, 3
    fw, fh = w + 2 * pad_x, h + pad_top + 2
    frames = []
    for f in range(8):
        bob = [0, 0, 1, 1, 0, 0, 1, 1][f]
        body = layer(e, char)
        # slurp: scroll the noodle strands upward toward the mouth
        shift = f % 4
        if shift:
            ys, xs = np.nonzero(noodles)
            for x in np.unique(xs):
                col = np.sort(ys[xs == x])
                colors = e[col, x].copy()
                body[col, x] = np.roll(colors, -shift, axis=0)
        frame = blank(fw, fh)
        paste(frame, body, pad_x, pad_top + bob)
        paste(frame, layer(e, bowl & opaque), pad_x, pad_top)
        sdy = [0, -1, -2, -3, -4, -3, -2, -1][f]
        sdx = [0, 0, 1, 1, 0, 0, -1, -1][f]
        paste(frame, layer(e, steam), pad_x + sdx, pad_top + sdy, alpha=[1, 1, 0.9, 0.8, 0.7, 0.8, 0.9, 1][f])
        if [1, 1, 1, 1, 0, 0, 1, 1][f]:
            paste(frame, layer(e, sparkle), pad_x + (f % 2 and 1 or 0) * 0, pad_top - (1 if f in (2, 3) else 0))
        frames.append(frame)
    return frames


def push_out(pieces: list[np.ndarray], img: np.ndarray, center: tuple[float, float], d: int) -> np.ndarray:
    """Move each ray a few pixels away from the head centre (rays 'pulse')."""
    out = np.zeros_like(img)
    for comp in pieces:
        ys, xs = np.nonzero(comp)
        vx, vy = xs.mean() - center[0], ys.mean() - center[1]
        n = max(1e-6, (vx * vx + vy * vy) ** 0.5)
        paste(out, layer(img, comp), int(round(vx / n * d)), int(round(vy / n * d)))
    return out


def build_victory_and_cheer(src: np.ndarray) -> dict[str, list[np.ndarray]]:
    v = cutout(src, (1012, 812, 1182, 902))
    h, w = v.shape[:2]
    main, pieces = split_effects(v)
    char = layer(v, main)
    rays = [p for p in pieces if yellow(v)[p].mean() > 0.2]
    ray_img = np.zeros_like(v)
    for p in rays:
        ray_img |= layer(v, p)
    center = (78.0, 52.0)
    band = (70, h - 2)  # jacket rows below the fists stretch during hops
    pad_top, pad_x = 10, 4
    fw, fh = w + 2 * pad_x, h + pad_top

    stars = [(30, 70, 3), (140, 50, 2), (150, 8, 3), (16, 10, 2)]

    def star(frame: np.ndarray, x: int, y: int, r: int, on: bool) -> None:
        if not on:
            return
        gold = np.array([246, 198, 74, 255], np.uint8)
        core = np.array([255, 247, 220, 255], np.uint8)
        for i in range(-r, r + 1):
            for (px, py) in ((x + i, y), (x, y + i)):
                if 0 <= px < frame.shape[1] and 0 <= py < frame.shape[0]:
                    frame[py, px] = gold
        frame[y, x] = core

    victory = []
    for f in range(8):
        n = [-1, 2, 5, 7, 8, 7, 5, 2][f]
        frame = blank(fw, fh)
        paste(frame, ray_img if f % 4 < 2 else push_out(rays, v, center, 3), pad_x, pad_top - n // 2)
        body = rise(char, n, band)
        paste(frame, body, pad_x, pad_top + h - body.shape[0])
        for i, (sx, sy, r) in enumerate(stars):
            star(frame, pad_x + sx, pad_top + sy - n // 2, r, (f + i) % 4 < 2)
        victory.append(frame)

    cheer = []
    for f in range(8):
        n = [0, 2, 3, 2, 0, 2, 3, 2][f]
        dx = [0, 0, -1, -1, 0, 0, 1, 1][f]
        frame = blank(fw, fh)
        if f % 4 in (1, 2):
            paste(frame, push_out(rays, v, center, 2), pad_x, pad_top)
        body = rise(char, n, band)
        paste(frame, body, pad_x + dx, pad_top + h - body.shape[0])
        cheer.append(frame)
    return {"victory": victory, "cheer": cheer}


def build_portrait(src: np.ndarray) -> np.ndarray:
    p = cutout(src, (517, 292, 588, 362))
    keep = components(p[..., 3] > 0)[0]
    p[~keep] = 0
    return p


# ------------------------------------------------------------------ output --
def save_sheet(name: str, frames: list[np.ndarray]) -> dict:
    fh, fw = frames[0].shape[:2]
    sheet = np.concatenate(frames, axis=1)
    path = OUT / f"{name}.png"
    Image.fromarray(sheet, "RGBA").save(path, optimize=True)
    return {"file": path.name, "frameWidth": fw, "frameHeight": fh, "frames": len(frames)}


def save_gif(path: Path, frames: list[np.ndarray], fps: int, scale: int = 3, bg=(246, 243, 238)) -> None:
    imgs = []
    for fr in frames:
        im = Image.new("RGBA", (fr.shape[1], fr.shape[0]), bg + (255,))
        im.alpha_composite(Image.fromarray(fr, "RGBA"))
        imgs.append(im.convert("RGB").resize((fr.shape[1] * scale, fr.shape[0] * scale), Image.NEAREST))
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=int(1000 / fps), loop=0)


ANIMS = {
    # name: (style, fps, loopFrom, description)
    "idle": ("full", 4, 0, "Standing: breathing with a blink"),
    "walk": ("full", 8, 0, "Little steps with a bounce (mirror to face left)"),
    "cheer": ("chibi", 10, 0, "Fists up, quick hops and sway"),
    "eat": ("chibi", 6, 0, "Slurping ramen with steam"),
    "victory": ("chibi", 8, 0, "Jump with pulsing rays and sparkles"),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", type=Path, help="also write animated GIF previews here")
    args = parser.parse_args()

    src = load_source()
    OUT.mkdir(parents=True, exist_ok=True)
    frames = build_avatar(src)
    frames["eat"] = build_eat(src)
    frames.update(build_victory_and_cheer(src))

    entries = {}
    for name, (style, fps, loop_from, desc) in ANIMS.items():
        sheet = f"avatar-{name}" if style == "full" else f"chibi-{name}"
        meta = save_sheet(sheet, frames[name])
        entries[name] = {**meta, "fps": fps, "loopFrom": loop_from, "style": style, "description": desc}
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            save_gif(args.preview / f"{sheet}.gif", frames[name], fps)

    portrait = build_portrait(src)
    Image.fromarray(portrait, "RGBA").save(OUT / "avatar-portrait.png", optimize=True)

    lines = [
        "// Generated by scripts/avatar/build_mock_sprites.py — do not edit by hand.",
        "// Sprite sheets are one row of equally sized frames, cut from the UI mock.",
        "",
        'export type AvatarAnimation = "idle" | "walk" | "cheer" | "eat" | "victory";',
        "",
        "export interface SpriteSheet {",
        "  source: number;",
        "  frameWidth: number;",
        "  frameHeight: number;",
        "  frames: number;",
        "  fps: number;",
        "  /** Frame to jump back to after the last frame. */",
        "  loopFrom: number;",
        '  style: "full" | "chibi";',
        "  description: string;",
        "}",
        "",
        "export const AVATAR_SPRITES: Record<AvatarAnimation, SpriteSheet> = {",
    ]
    for name, e in entries.items():
        lines += [
            f"  {name}: {{",
            f'    source: require("../../assets/avatar/{e["file"]}"),',
            f"    frameWidth: {e['frameWidth']},",
            f"    frameHeight: {e['frameHeight']},",
            f"    frames: {e['frames']},",
            f"    fps: {e['fps']},",
            f"    loopFrom: {e['loopFrom']},",
            f'    style: "{e["style"]}",',
            f"    description: {json.dumps(e['description'])},",
            "  },",
        ]
    lines += [
        "};",
        "",
        "export const AVATAR_PORTRAIT = {",
        '  source: require("../../assets/avatar/avatar-portrait.png"),',
        f"  width: {portrait.shape[1]},",
        f"  height: {portrait.shape[0]},",
        "};",
        "",
    ]
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    for name, e in entries.items():
        print(f"{name:8s} {e['file']:24s} {e['frames']} x {e['frameWidth']}x{e['frameHeight']} @ {e['fps']}fps")


if __name__ == "__main__":
    main()
