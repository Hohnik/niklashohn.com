#!/usr/bin/env python3
"""Generate a true pixel-art gravestone spritesheet (7 variants).

Consistent light from the TOP-LEFT: each stone is shaded with three analogous
tones (warm highlight on the top-left, neutral base, cool shadow on the
bottom-right) plus a dark outline, seated in a grass mound. The lower face is
left blank so the visitor's duck name can be engraved on it at runtime.

Outputs:
  animation/gravestones.png       spritesheet (40*7 x 48, RGBA)
  tools/_gravestones_contact.png  magnified review sheet

Run from repo root:  python3 tools/gen_gravestone.py
"""
import os
import random as _r
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "animation", "gravestones.png")
CONTACT = os.path.join(ROOT, "tools", "_gravestones_contact.png")

W, H = 40, 48
N = 7

# Stone: three analogous tones (warm-light -> neutral -> cool-shadow) + outline.
S_HI = (198, 194, 182, 255)
S_BASE = (140, 140, 150, 255)
S_SH = (92, 90, 114, 255)
OUTLINE = (34, 32, 48, 255)
ENGRAVE = (70, 68, 88, 255)  # for the pre-baked symbols
SPARK = (236, 236, 246, 255)
# Wood tones for the marker variant.
WD_HI = (168, 128, 80, 255)
WD_BASE = (135, 98, 58, 255)
WD_SH = (96, 66, 40, 255)
# Grass / moss / dirt for the base.
GRASS = (112, 188, 86, 255)
GRASS_D = (79, 150, 60, 255)
DIRT = (120, 92, 60, 255)
MOSS = (96, 150, 66, 255)
MOSS_D = (72, 118, 52, 255)
CLEAR = (0, 0, 0, 0)


def rounded(flat_top=False, arched=False):
    """{y: (l, r)} silhouette for a broad headstone."""
    rows = {}
    L, R = 6, 33
    if flat_top:
        top = [(6, L + 1, R - 1), (7, L, R)]
        body_start = 8
    elif arched:
        top = [(4, 16, 23), (5, 13, 26), (6, 11, 28), (7, 9, 30), (8, 8, 31), (9, 7, 32), (10, L, R)]
        body_start = 11
    else:
        top = [(4, 14, 25), (5, 11, 28), (6, 9, 30), (7, 8, 31), (8, 7, 32), (9, L, R)]
        body_start = 10
    for y, l, r in top:
        rows[y] = (l, r)
    for y in range(body_start, 42):
        rows[y] = (L, R)
    return rows


def shade_stone(px, rows, hi, base, sh):
    inside = set()
    for y, (l, r) in rows.items():
        for x in range(l, r + 1):
            inside.add((x, y))
    top_y = min(rows)
    bot_y = max(rows)
    for (x, y) in inside:
        l, r = rows[y]
        near_l = x - l
        near_r = r - x
        c = base
        # lit top-left
        if (near_l <= 1 and y < top_y + (bot_y - top_y) * 0.65) or y <= top_y + 1:
            c = hi
        # cool shadow bottom-right (wins)
        if (near_r <= 1 and y > top_y + (bot_y - top_y) * 0.35) or y >= bot_y - 1:
            c = sh
        px[x, y] = c
    # outline
    for (x, y) in list(inside):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if (nx, ny) not in inside and 0 <= nx < W and 0 <= ny < H:
                    px[nx, ny] = OUTLINE
    # sparkle on the lit shoulder
    px[top_y + 2, top_y] if False else None
    return inside, top_y, bot_y


# 5x5 symbols engraved into the upper face.
def sym_cross(px, cx, cy):
    for y in range(cy, cy + 9):
        px[cx, y] = ENGRAVE
        px[cx + 1, y] = ENGRAVE
    for x in range(cx - 3, cx + 5):
        px[x, cy + 2] = ENGRAVE
        px[x, cy + 3] = ENGRAVE


def sym_heart(px, cx, cy):
    pat = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."]
    for gy, row in enumerate(pat):
        for gx, c in enumerate(row):
            if c == "#":
                px[cx - 3 + gx, cy + gy] = ENGRAVE


FONT3 = {
    "R": ["###", "#.#", "###", "##.", "#.#"],
    "I": ["###", ".#.", ".#.", ".#.", "###"],
    "P": ["###", "#.#", "###", "#..", "#.."],
}


def sym_rip(px, cx, cy):
    text = "RIP"
    x0 = cx - (len(text) * 4 - 1) // 2
    for i, ch in enumerate(text):
        for gy, row in enumerate(FONT3[ch]):
            for gx, c in enumerate(row):
                if c == "#":
                    px[x0 + i * 4 + gx, cy + gy] = ENGRAVE


def draw_moss(px, inside, seed):
    rng = _r.Random(seed)
    for (x, y) in inside:
        if y < 26:
            continue
        edge = (x - 6) + (41 - y)
        p = max(0.0, 0.5 - edge * 0.05)
        if rng.random() < p:
            px[x, y] = MOSS if rng.random() < 0.6 else MOSS_D


def crack(px, inside):
    for (x, y) in [(20, 10), (21, 12), (20, 14), (21, 16), (20, 18), (22, 20), (21, 22)]:
        if (x, y) in inside:
            px[x, y] = OUTLINE


def draw_grass(px):
    for x in range(3, 37):
        px[x, 42] = GRASS_D
        px[x, 43] = GRASS if x % 2 == 0 else GRASS_D
    for x in range(5, 35):
        if x % 3 == 0:
            px[x, 41] = GRASS
            px[x, 40] = GRASS
    for x in range(11, 29):
        if x % 4 == 0:
            px[x, 42] = DIRT


def make_variant(v):
    img = Image.new("RGBA", (W, H), CLEAR)
    px = img.load()
    if v == 4 or v == 5:
        rows = rounded(flat_top=True)
    elif v == 6:
        rows = rounded()  # wooden, round-ish
    else:
        rows = rounded(arched=(v == 3))
    if v == 6:
        inside, ty, by = shade_stone(px, rows, WD_HI, WD_BASE, WD_SH)
        # wood grain
        for (x, y) in inside:
            if (x + y) % 5 == 0 and 8 < y < 40:
                px[x, y] = WD_SH
    else:
        inside, ty, by = shade_stone(px, rows, S_HI, S_BASE, S_SH)

    if v == 1:
        sym_cross(px, 20, 12)
    elif v == 2:
        sym_heart(px, 20, 13)
    elif v == 3:
        sym_rip(px, 20, 13)
    elif v == 5:
        crack(px, inside)

    if v in (2, 5):
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

    scale = 6
    pad = 6
    contact = Image.new("RGBA", (N * (W * scale + pad) + pad, H * scale + 2 * pad), (95, 150, 80, 255))
    for i, img in enumerate(variants):
        big = img.resize((W * scale, H * scale), Image.NEAREST)
        contact.alpha_composite(big, (pad + i * (W * scale + pad), pad))
    contact.save(CONTACT)
    print(f"wrote {OUT} ({W*N}x{H}, {N} variants)")
    print(f"wrote {CONTACT}")


if __name__ == "__main__":
    build()
