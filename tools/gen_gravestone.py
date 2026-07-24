#!/usr/bin/env python3
"""Generate a true pixel-art gravestone spritesheet.

Classic rounded headstone: bold dark outline, shaded grey stone, an engraved
symbol (RIP / cross / heart / crack), seated in a little grass mound. Four
variants for graveyard variety.

Outputs:
  animation/gravestones.png       spritesheet  (32*4 x 34, RGBA)
  tools/_gravestones_contact.png  magnified review sheet

Run from repo root:  python3 tools/gen_gravestone.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "animation", "gravestones.png")
CONTACT = os.path.join(ROOT, "tools", "_gravestones_contact.png")

W, H = 32, 34
N = 4

# Palette
OUTLINE = (35, 33, 46, 255)
STONE = (138, 138, 150, 255)
STONE_HI = (183, 183, 196, 255)
STONE_HI2 = (214, 214, 226, 255)
STONE_SH = (99, 99, 112, 255)
STONE_SH2 = (76, 76, 88, 255)
ENGRAVE = (58, 56, 72, 255)
SPARK = (240, 240, 250, 255)
GRASS = (108, 192, 78, 255)
GRASS_D = (79, 158, 58, 255)
DIRT = (122, 90, 60, 255)
MOSS = (96, 150, 66, 255)
MOSS_D = (72, 118, 52, 255)
CLEAR = (0, 0, 0, 0)

# 3x5 mini font for the engraving.
FONT = {
    "R": ["###", "#.#", "###", "##.", "#.#"],
    "I": ["###", ".#.", ".#.", ".#.", "###"],
    "P": ["###", "#.#", "###", "#..", "#.."],
}


def rounded_silhouette(flat_top=False):
    """Return {y: (left, right)} for the stone body."""
    rows = {}
    if flat_top:
        top = [(4, 8, 23), (5, 7, 24), (6, 6, 25)]
    else:
        top = [(3, 12, 19), (4, 10, 21), (5, 9, 22), (6, 8, 23), (7, 7, 24), (8, 7, 24), (9, 6, 25)]
    for y, l, r in top:
        rows[y] = (l, r)
    start = 7 if flat_top else 10
    for y in range(start, 30):
        rows[y] = (6, 25)
    return rows


def draw_stone(px, rows):
    inside = set()
    for y, (l, r) in rows.items():
        for x in range(l, r + 1):
            inside.add((x, y))
    # Fill with shading.
    for (x, y) in inside:
        l, r = rows[y]
        near_l = x - l
        near_r = r - x
        top_edge = min((y - yy) for yy in [min(rows)]) if False else None
        c = STONE
        # top-left highlight
        if near_l <= 1 or (y <= min(rows) + 2):
            c = STONE_HI
        if near_l == 0 or y == min(rows):
            c = STONE_HI2
        # bottom-right shadow (wins)
        if near_r <= 1 or y >= 28:
            c = STONE_SH
        if near_r == 0 or y == 29:
            c = STONE_SH2
        px[x, y] = c
    # Outline: any empty 4-neighbour of an inside pixel.
    for (x, y) in list(inside):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) not in inside and 0 <= nx < W and 0 <= ny < H:
                px[nx, ny] = OUTLINE
    # sparkle
    px[19, 5] = SPARK
    px[20, 6] = SPARK
    return inside


def engrave_text(px, text, cx, cy):
    total = len(text) * 4 - 1
    x0 = cx - total // 2
    for i, ch in enumerate(text):
        glyph = FONT[ch]
        for gy, row in enumerate(glyph):
            for gx, c in enumerate(row):
                if c == "#":
                    px[x0 + i * 4 + gx, cy + gy] = ENGRAVE


def engrave_cross(px, cx, cy):
    for y in range(cy, cy + 11):
        px[cx, y] = ENGRAVE
        px[cx + 1, y] = ENGRAVE
    for x in range(cx - 3, cx + 5):
        px[x, cy + 3] = ENGRAVE
        px[x, cy + 4] = ENGRAVE


def engrave_heart(px, cx, cy):
    pat = [
        ".##.##.",
        "#######",
        "#######",
        ".#####.",
        "..###..",
        "...#...",
    ]
    for gy, row in enumerate(pat):
        for gx, c in enumerate(row):
            if c == "#":
                px[cx - 3 + gx, cy + gy] = ENGRAVE


def draw_moss(px, inside, seed):
    # Weathered moss creeping up the lower-left of the stone, deterministic per seed.
    import random as _r
    rng = _r.Random(seed)
    for (x, y) in inside:
        if y < 20:
            continue
        edge_left = (x - 8) + (29 - y)  # closeness to bottom-left corner
        p = max(0.0, 0.55 - edge_left * 0.06)
        if rng.random() < p:
            px[x, y] = MOSS if rng.random() < 0.6 else MOSS_D


def draw_grass(px):
    # ground line of grass tufts across the base, with a few tall blades.
    for x in range(2, 30):
        px[x, 30] = GRASS_D
        px[x, 31] = GRASS if (x % 2 == 0) else GRASS_D
    for x in range(4, 28):
        if x % 3 == 0:
            px[x, 29] = GRASS
            px[x, 28] = GRASS
    # a couple of dirt specks under the stone
    for x in range(9, 23):
        px[x, 30] = DIRT if (x % 4 == 0) else px[x, 30]


def make_variant(v):
    img = Image.new("RGBA", (W, H), CLEAR)
    px = img.load()
    flat = v == 3
    rows = rounded_silhouette(flat_top=flat)
    inside = draw_stone(px, rows)
    if v == 0:
        engrave_text(px, "RIP", 16, 13)
    elif v == 1:
        engrave_cross(px, 15, 11)
    elif v == 2:
        engrave_heart(px, 16, 13)
    elif v == 3:
        # cracked slab: a lightning crack + RIP lower
        for (x, y) in [(15, 8), (16, 9), (15, 10), (16, 11), (15, 12), (17, 13), (16, 14)]:
            if (x, y) in inside:
                px[x, y] = STONE_SH2
        engrave_text(px, "RIP", 16, 17)
    if v in (1, 3):
        draw_moss(px, inside, seed=v * 7 + 3)
    draw_grass(px)
    return img


def build():
    sheet = Image.new("RGBA", (W * N, H), CLEAR)
    variants = []
    for v in range(N):
        img = make_variant(v)
        variants.append(img)
        sheet.alpha_composite(img, (v * W, 0))
    sheet.save(OUT)

    scale = 8
    pad = 6
    contact = Image.new("RGBA", (N * (W * scale + pad) + pad, H * scale + 2 * pad), (154, 132, 204, 255))
    for i, img in enumerate(variants):
        big = img.resize((W * scale, H * scale), Image.NEAREST)
        contact.alpha_composite(big, (pad + i * (W * scale + pad), pad))
    contact.save(CONTACT)
    print(f"wrote {OUT} ({W*N}x{H}, {N} variants)")
    print(f"wrote {CONTACT}")


if __name__ == "__main__":
    build()
